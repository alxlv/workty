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
var Promise = require('promise');
var config = rootRequire('config');
var SubVersion = config.restapi.getLatestVersion().sub; // YYYY.M.D

// Init the test client using supervisor account (all acl permissions)
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

describe('Account context supervisor permissions', function () {
    var socket;
    var user = request.agent();
    var Accounts = [];
    var ContextName = 'accounts';
    var AccountsPerPage = 1;

    console.log('Run Account context supervisor permissions tests for version ' + ApiPrefix + '/' + SubVersion);

    function _createPromises(callback, count) {
        var promises = [];

        for (var idx = 0; idx < count; idx++) {
            promises.push(callback(idx));
        }

        return promises;
    }

    function _createAccount(idx) {
        return new Promise(function (resolve, reject) {
            try {
                // Create account with default acl
                adminClient.post(ApiPrefix + '/accounts', {
                    name: 'myaccount' + idx,
                    email: 'myaccount' + idx + '@workty.com',
                    password: 'regularuser' + idx,
                    aclRoleNames: ['regular']
                }, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _deleteAccount(idx) {
        return new Promise(function (resolve, reject) {
            try {
                adminClient.del(ApiPrefix + '/accounts/' + Accounts[idx]._id + '?removing=true', function (err, req, res, data) {
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

        Promise.all(_createPromises(_createAccount, AccountsPerPage)).then(function (results) { // Create accounts
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                Accounts.push(data);
            }

            // TODO: Check why login placed here leads to crash

        }).done(function (err) {
            expect(err).to.be.undefined;
            // Login by regular user
            user
                .post(config.client.getConnectionString() + '/')
                .send({email: Accounts[0].email, password: 'regularuser0'})
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

    it('should return 1 account for refresh all operation', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.account).to.not.be.empty;
            expect(data.account.id).to.be.equal(Accounts[0]._id);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should return 1 own account for refresh operation', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.account).to.not.be.empty;
            expect(data.account.id).to.be.equal(Accounts[0]._id);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {account: {id: Accounts[0]._id}});
    });

    it('should add 0 accounts and return a 500 response with operation forbidden error', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < AccountsPerPage; idx++) {
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

    it('should update 1 account and return updated account', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.account).to.not.be.empty;
            expect(data.account.id).to.be.equal(Accounts[0]._id);
            expect(data.account.name).to.be.equal('newname2');
            expect(data.account.email).to.be.equal('Accounttmp2@workty.com');
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD.name, {
            account: {
                id: Accounts[0]._id,
                name: 'newname2',
                email: 'Accounttmp2@workty.com'
            }
        });
    });

    it('should delete 1 accounts and return deleted account', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.account).to.not.be.empty;
            expect(data.account.id).to.be.equal(Accounts[0]._id);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < AccountsPerPage; idx++) {
            (function (i) {
                socket.emit(protocolClient.DEL.name, {account: {id: Accounts[i]._id, removing: true}});
            })(idx);
        }
    });
});