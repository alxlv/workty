'use strict';
/**
 * Created by Alex Levshin on 26/11/16.
 */
var RootFolder = process.env.ROOT_FOLDER;
var ApiMajorVersion = process.env.API_MAJOR_VERSION;

if (!global.rootRequire) {
    global.rootRequire = function (name) {
        return require(RootFolder + '/' + name);
    };
}

var _ = require('lodash');
var fs = require('fs');
var restify = require('restify');
var expect = require('chai').expect;
var request = require('superagent');
var ApiPrefix = '/api/v1';
var io = require('socket.io-client');
var crypto = require('crypto');
var config = rootRequire('config');
var protocolClient = rootRequire('shared/protocols/v1/client-sv-payments.module').OPERATIONS;
var Promise = require('promise');
var WorktyRepositoryCodePath = RootFolder + '/workties-repository';
var SubVersion = config.restapi.getLatestVersion().sub; // YYYY.M.D

// Init the test client to get account
var adminClient = restify.createJsonClient({
    version: SubVersion,
    url: config.restapi.getConnectionString(),
    headers: {
        'Authorization': config.supervisor.getAuthorizationBasic() // supervisor
    },
    rejectUnauthorized: false
});

// TODO: Move in single module
function _generateToken(account, salt) {
    var sha256 = crypto.createHash('sha256');

    sha256.update(account.id);
    sha256.update(account.name);
    sha256.update(salt);

    return sha256.digest('hex');
}

function _getAccount(dbAccount) {
    var account = {};

    account.id = dbAccount._id;
    account.name = dbAccount.email;
    account.host = config.client.getConnectionString() + '/' + account.id;
    var salt = dbAccount.password || dbAccount.oauthID;
    account.token = _generateToken(account, salt);

    return account;
}

describe('Payment context supervisor', function () {
    var socket;
    var user = request.agent();
    var Workties = [];
    var Payments = [];
    var ContextName = 'payments';
    var WORKTIES_COUNT = 5;
    var WORKTIES_FILENAMES = ['clouding/nodejs/facebook-generic.zip'];

    console.log('Run Payment context supervisor tests for version ' + ApiPrefix + '/' + SubVersion);

    function _createPromises(callback, params) {
        var promises = [];

        for (var idx = 0; idx < params.count; idx++) {
            params.idx = idx;
            promises.push(callback(params));
        }

        return promises;
    }

    function _createWorkty(params) {
        return new Promise(function (resolve, reject) {
            try {
                var compressedCode = fs.readFileSync(WorktyRepositoryCodePath + '/' + WORKTIES_FILENAMES[0]);
                adminClient.post(ApiPrefix + '/workties', {
                    name: 'myworkty' + params.idx,
                    desc: 'worktydesc' + params.idx,
                    compressedCode: compressedCode,
                    template: true
                }, function (err, req, res, data) {
                    var workty = data;
                    adminClient.post(ApiPrefix + '/workties/' + data._id + '/properties', {
                        property: {
                            name: 'PropertyName',
                            value: 'PropertyValue'
                        }
                    }, function (err, req, res, data) {
                        workty.propertiesIds = [data];
                        resolve({res: res, data: workty});
                    });
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _deleteWorkty(params) {
        return new Promise(function (resolve, reject) {
            try {
                var id = params.workties[params.idx]._id;
                params.client.del(ApiPrefix + '/workties/' + id, function (err, req, res, data) {
                    resolve({res: res});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    // Run once before the first test case
    before(function (done) {
        this.timeout(8000);

        Promise.all(_createPromises(_createWorkty, {count: WORKTIES_COUNT})).then(function (results) { // Create admin workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                Workties.push(data);
            }
        }).done(function (err) {
            expect(err).to.be.undefined;

            // Get all account (supervisor should be first)
            adminClient.get(ApiPrefix + '/accounts', function (err, req, res, data) {
                if (err) {
                    return done(err);
                }

                // Login
                user
                    .post(config.client.getConnectionString() + '/')
                    .send({email: config.supervisor.email, password: config.supervisor.password})
                    .end(function (err, res) {
                        if (err) {
                            return done(err);
                        }

                        var account = _getAccount(data[0]);

                        // Connect via websocket
                        var host = config.client.getConnectionString() + '/' + account.id + '_' + ContextName;
                        socket = io.connect(host, {
                            transports: ['websocket', 'polling', 'flashsocket'],
                            'log level': 2,
                            'polling duration': 10
                        });

                        socket.on('connect', function _onClientConnected() {
                            console.log('connecting...');
                            socket.emit('authentication', account);
                        });

                        socket.on('disconnect', function () {
                            console.log('disconnected...');
                        });

                        done();
                    });
            });
        });
    });

    // Run once after the last test case
    after(function (done) {
        this.timeout(8000);

        Promise.all(_createPromises(_deleteWorkty, {
            count: WORKTIES_COUNT,
            workties: Workties,
            client: adminClient
        })).then(function (results) {
            for (var idx = 0; idx < results.length; idx++) { // Delete admin workties
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            var superUserWorkties = [];
            for (idx = 0; idx < Payments.length; idx++) {
                superUserWorkties.push({_id: Payments[idx].worktyId});
            }

            return Promise.all(_createPromises(_deleteWorkty, {
                count: Payments.length,
                workties: superUserWorkties,
                client: adminClient
            }));
        }).then(function (results) {
            for (var idx = 0; idx < results.length; idx++) { // Delete super user workties for payments
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }
        }).done(function (err) {
            expect(err).to.be.undefined;

            // Logout
            user
                .get(config.client.getConnectionString() + '/logout')
                .end(function (err, res) {
                    if (err) {
                        return done(err);
                    }

                    // Close websocket
                    if (socket && socket.connected) {
                        console.log('disconnecting...');
                        socket.disconnect();
                    } else {
                        // There will not be a connection unless you have done() in beforeEach, socket.on('connect'...)
                        console.log('no connection to break...');
                    }

                    done();
                });
        });
    });

    it('should add 5 payments', function (done) {
        var idxPayment = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            Payments.push(data.paymentTransaction);
            if (++idxPayment === WORKTIES_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < WORKTIES_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.ADD.name, {
                    paymentTransaction: {
                        worktyId: Workties[0]._id
                    }
                });
            })(idx);
        }
    });

    //Refresh all code changes the positions of elements in array, that's why this test goes first
    it('should return 1 payemnt', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.paymentTransaction.id).to.be.equals(Payments[0].id);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {paymentTransaction: {id: Payments[0].id}});
    });

    it('should return 5 payments', function (done) {
        var idxPayment = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (++idxPayment === WORKTIES_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should delete 5 payments', function (done) {
        var idxPayment = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.paymentTransaction && data.paymentTransaction.deleted) {
                expect(data.paymentTransaction.deleted).to.be.equals(true);
                if (++idxPayment === WORKTIES_COUNT) {
                    socket.off(protocolClient.CHANGED, _onDataReceived);
                    done();
                }
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < WORKTIES_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.DEL.name, {paymentTransaction: {id: Payments[i].id}});
            })(idx);
        }
    });

    it('should add and delete 1 payment', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            socket.emit(protocolClient.DEL.name, {paymentTransaction: {id: data.paymentTransaction.id}});
            if (data.paymentTransaction.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else {
                Payments.push(data.paymentTransaction);
                expect(data.paymentTransaction.msg).to.be.equals('ok');
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {paymentTransaction: {worktyId: Workties[0]._id}});
    });

    it('should add and update 1 payment', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.paymentTransaction.msg === 'ok') {
                Payments.push(data.paymentTransaction);
                socket.emit(protocolClient.UPD.name, {
                    paymentTransaction: {
                        id: data.paymentTransaction.id,
                        msg: 'still ok'
                    }
                });
            } else if (data.paymentTransaction.msg === 'still ok') {
                socket.emit(protocolClient.DEL.name, {paymentTransaction: {id: data.paymentTransaction.id}});
            }

            if (data.paymentTransaction.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {paymentTransaction: {worktyId: Workties[0]._id}});
    });

    it('should return response for empty refresh all request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should return 400 response for empty refresh request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {});
    });

    it('should return 400 response for empty add request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {});
    });

    it('should return 400 response for empty update request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD.name, {});
    });

    it('should return 400 response for empty delete request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.DEL.name, {});
    });

    it('should return 400 response for incorrect add request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {sdfsdf: {sasdad: 1}});
    });

    it('should return 400 response for incorrect update request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD.name, {sdfsdf: {sasdad: 1}});
    });

    it('should return 400 response for incorrect delete request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.DEL.name, {sdfsdf: {sasdad: 1}});
    });
});