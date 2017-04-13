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
var restify = require('restify');
var expect = require('chai').expect;
var request = require('superagent');
var ApiPrefix = '/api/v1';
var io = require('socket.io-client');
var crypto = require('crypto');
var protocolClient = rootRequire('shared/protocols/v1/client-sv-accounts.module').OPERATIONS;
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

describe('Account context supervisor', function () {
    var socket;
    var user = request.agent();
    var Accounts = [];
    var ContextName = 'accounts';
    var ACCOUNTS_COUNT = 4;

    console.log('Run Account context supervisor tests for version ' + ApiPrefix + '/' + SubVersion);

    // Run once before the first test case
    before(function (done) {
        this.timeout(8000);

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

    // Run once after the last test case
    after(function (done) {
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

    it('should add 4 accounts', function (done) {
        var idxAccount = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            Accounts.push(data.account);
            if (++idxAccount === ACCOUNTS_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < ACCOUNTS_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.ADD.name, {
                    account: {
                        oauthID: '',
                        name: 'Account_' + i,
                        email: 'Account_' + i + '@workty.com',
                        password: 'Account_' + i + '_pwd',
                        aclRoleNames: ['regular']
                    }
                });
            })(idx);
        }
    });

    //Refresh all code changes the positions of elements in array, that's why this test goes first
    it('should return 1 account', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.account.id).to.be.equals(Accounts[0].id);
            expect(data.account.name).to.be.equals(Accounts[0].name);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {account: {id: Accounts[0].id}});
    });

    // 4 + supervisor account
    it('should return 5 accounts', function (done) {
        var idxAccount = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (++idxAccount === ACCOUNTS_COUNT + 1) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should delete 4 accounts', function (done) {
        var idxAccount = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.account && data.account.deleted) {
                expect(data.account.deleted).to.be.equals(true);
                if (++idxAccount === ACCOUNTS_COUNT) {
                    socket.off(protocolClient.CHANGED, _onDataReceived);
                    done();
                }
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < ACCOUNTS_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.DEL.name, {account: {id: Accounts[i].id, removing: true}});
            })(idx);
        }
    });

    it('should add and delete 1 account', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.account.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else {
                expect(data.account.name).to.be.equals('Name');
                socket.emit(protocolClient.DEL.name, {account: {id: data.account.id, removing: true}});
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            account: {
                name: 'Name',
                oauthID: '',
                email: 'Accounttmp@workty.com',
                password: 'Accounttmp',
                aclRoleNames: ['regular']
            }
        });
    });

    it('should add and update 1 account', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.account.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else if (data.account.name === 'Name2') {
                expect(data.account.email).to.be.equals('Accounttmp2@workty.com');
                socket.emit(protocolClient.UPD.name, {
                    account: {
                        id: data.account.id,
                        name: 'newname3',
                        email: 'Accounttmp3@workty.com'
                    }
                });
            } else if (data.account.name === 'newname3') {
                expect(data.account.email).to.be.equals('Accounttmp3@workty.com');
                socket.emit(protocolClient.DEL.name, {account: {id: data.account.id, removing: true}});
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            account: {
                name: 'Name2',
                oauthID: '',
                email: 'Accounttmp2@workty.com',
                password: 'Accounttmp',
                aclRoleName: ['regular']
            }
        });
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

    it('should return 400 response for incorrect refresh request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {sdfsdf: {sasdad: 1}});
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

    it('should return 400 response for incorrect id update request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD.name, {account: {id: 1}});
    });
});