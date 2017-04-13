'use strict';
/**
 * Created by Alex Levshin on 26/11/16.
 */
var RootFolder = process.env.ROOT_FOLDER;

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
var protocolClient = rootRequire('shared/protocols/v1/client-sv-payments.module').OPERATIONS;
var Promise = require('promise');
var WorktyRepositoryCodePath = RootFolder + '/workties-repository';
var config = rootRequire('config');
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

describe('Payment context supervisor permissions', function () {
    var socket;
    var user = request.agent();
    var Clients = [];
    var Accounts = [];
    var SuperuserWorkties = [];
    var RegularuserPayments = [];
    var AccountsPerPage = 1;
    var ContextName = 'payments';
    var WORKTIES_COUNT = 1;
    var WORKTIES_FILENAMES = ['clouding/nodejs/facebook-generic.zip'];

    console.log('Run Payment context supervisor permissions tests for version ' + ApiPrefix + '/' + SubVersion);

    function _createPromises(callback, params) {
        var promises = [];

        for (var idx = 0; idx < params.count; idx++) {
            params.idx = idx;
            promises.push(callback(params));
        }

        return promises;
    }

    function _createAccount(params) {
        return new Promise(function (resolve, reject) {
            try {
                // Create account with default acl
                adminClient.post(ApiPrefix + '/accounts', {
                    name: 'myaccount' + params.idx,
                    email: 'myaccount' + params.idx + '@workty.com',
                    password: 'Regularuser' + params.idx,
                    aclRoleNames: ['regular']
                }, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
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

    function _deleteAccount(params) {
        return new Promise(function (resolve, reject) {
            try {
                adminClient.del(ApiPrefix + '/accounts/' + Accounts[params.idx]._id + '?removing=true', function (err, req, res, data) {
                    resolve({res: res});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _deletePayment(params) {
        return new Promise(function (resolve, reject) {
            try {
                params.client.del(ApiPrefix + '/payments/' + params.payments[params.idx].id, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    // Run once before the first test case
    before(function (done) {
        this.timeout(8000);

        Promise.all(_createPromises(_createAccount, {count: AccountsPerPage})).then(function (results) { // Create accounts
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                Accounts.push(data);

                var client = restify.createJsonClient({
                    version: SubVersion,
                    url: config.restapi.getConnectionString(),
                    headers: {
                        'Authorization': 'Basic ' + new Buffer(data.email + ':' + 'Regularuser' + idx).toString('base64')
                    },
                    rejectUnauthorized: false
                });

                Clients.push(client);
            }

            return Promise.all(_createPromises(_createWorkty, {count: WORKTIES_COUNT}));
        }).then(function (results) { // Create admin workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                SuperuserWorkties.push(data);
            }
        }).done(function (err) {
            expect(err).to.be.undefined;
            // Login by Regular user
            user
                .post(config.client.getConnectionString() + '/')
                .send({email: Accounts[0].email, password: 'Regularuser0'})
                .end(function (err, res) {
                    if (err) {
                        return done(err);
                    }

                    var account = _getAccount(Accounts[0]);

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

    // Run once after the last test case
    after(function (done) {
        Promise.all(_createPromises(_deleteWorkty, {
            count: WORKTIES_COUNT,
            workties: SuperuserWorkties,
            client: adminClient
        })).then(function (results) {
            var idx;
            for (idx = 0; idx < results.length; idx++) { // Delete admin workties
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            var RegularUserWorkties = [];
            for (idx = 0; idx < RegularuserPayments.length; idx++) {
                RegularUserWorkties.push({_id: RegularuserPayments[idx].worktyId});
            }

            return Promise.all(_createPromises(_deleteWorkty, {
                count: RegularuserPayments.length,
                workties: RegularUserWorkties,
                client: adminClient
            }));
        }).then(function (results) {
            for (var idx = 0; idx < results.length; idx++) { // Delete Regular user workties
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            return Promise.all(_createPromises(_deleteAccount, {count: AccountsPerPage}));
        }).then(function (results) { // Delete accounts
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            return Promise.all(_createPromises(_deletePayment, {
                count: RegularuserPayments.length,
                client: adminClient,
                payments: RegularuserPayments
            }));
        }).then(function (results) {
            for (var idx = 0; idx < results.length; idx++) { // Delete Regular payments
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

    it('should add 1 payment', function (done) {
        var idxPayment = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (++idxPayment === WORKTIES_COUNT) {
                RegularuserPayments.push(data.paymentTransaction);
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < WORKTIES_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.ADD.name, {
                    paymentTransaction: {
                        worktyId: SuperuserWorkties[idx]._id
                    }
                });
            })(idx);
        }
    });

    //Refresh all code changes the positions of elements in array, that's why this test goes first
    it('should return 1 payment for refresh operation', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.paymentTransaction.id).to.be.equals(RegularuserPayments[0].id);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {paymentTransaction: {id: RegularuserPayments[0].id}});
    });

    it('should return 1 payment for refresh all operation', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.paymentTransaction.id).to.be.equals(RegularuserPayments[0].id);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should update 0 payment and return 500 response with operation forbidden error', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD.name, {
            paymentTransaction: {
                id: RegularuserPayments[0].id,
                msg: 'new message'
            }
        });
    });

    it('should delete 0 payment and return 500 response with operation forbidden error', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.DEL.name, {paymentTransaction: {id: RegularuserPayments[0].id}});
    });
});