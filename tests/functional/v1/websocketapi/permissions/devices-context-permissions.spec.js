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
var protocolClient = rootRequire('shared/protocols/v1/client-sv-devices.module').OPERATIONS;
var Promise = require('promise');
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

describe('Device context supervisor permissions', function () {
    var socket;
    var user = request.agent();
    var Accounts = [];
    var AccountsPerPage = 1;
    var ContextName = 'devices';

    console.log('Run Device context supervisor permissions tests for version ' + ApiPrefix + '/' + SubVersion);

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
        }).done(function (err) {
            expect(err).to.be.undefined;
            // Login by common user
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
        Promise.all(_createPromises(_deleteAccount, AccountsPerPage)).then(function (results) { // Delete accounts
            for (var idx = 0; idx < results.length; idx++) {
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

    it('should return 0 devices for refresh all operation and a 500 response with operation forbidden error', function (done) {
        function _onDataReceived(data) {
            console.log(data.err);
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should return 0 devices for refresh operation and a 500 response with operation forbidden error', function (done) {
        var PI1_ID = '550ed4c2f4d4dfbb78275223';

        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {device: {id: PI1_ID}});
    });

    it('should add 0 devices and return a 500 response with operation forbidden error', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            device: {
                ip4Address: '10.11.12.13',
                port: 3001,
                protocol: 'ws',
                name: 'Name',
                state: 'waiting'
            }
        });
    });

    it('should update 0 devices and return a 500 response with operation forbidden error', function (done) {
        var PI1_ID = '550ed4c2f4d4dfbb78275223';

        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD.name, {
            device: {
                id: PI1_ID,
                name: 'newname',
                protocol: 'wss',
                ip4Address: '11.12.13.14',
                port: 3002,
                state: 'running'
            }
        });
    });

    it('should delete 0 devices and return a 500 response with operation forbidden error', function (done) {
        var PI1_ID = '550ed4c2f4d4dfbb78275223';

        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.DEL.name, {device: {id: PI1_ID}});
    });
});