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
var config = rootRequire('config');
var protocolClient = rootRequire('shared/protocols/v1/client-sv-devices.module').OPERATIONS;
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

describe('Device context supervisor', function () {
    var socket;
    var user = request.agent();
    var ContextName = 'devices';
    var Devices = [];

    console.log('Run Device context supervisor tests for version ' + ApiPrefix + '/' + SubVersion);

    // Run once before the first test case
    before(function (done) {
        this.timeout(8000);

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
                if (socket.connected) {
                    console.log('disconnecting...');
                    socket.disconnect();
                } else {
                    // There will not be a connection unless you have done() in beforeEach, socket.on('connect'...)
                    console.log('no connection to break...');
                }

                done();
            });
    });
/*
    it('should return 15 devices', function (done) {
        this.timeout(5000);

        var DEVICES_COUNT = 15;
        var idxDevice = 1;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            Devices.push(data.device);
            if (idxDevice++ > DEVICES_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                return done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should return 1 device', function (done) {
        var PI1_ID = Devices[0].id;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            var found = false;
            for (var idx = 0; idx < Devices.length; idx++) {
                if (data.device.id === Devices[idx].id) {
                    found = true;
                    break;
                }
            }
            expect(found).to.be.equals(true);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {device: {id: PI1_ID}});
    });*/

    it('should add and delete 1 device', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            socket.emit(protocolClient.DEL.name, {device: {id: data.device.id}});
            if (data.device.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else {
                expect(data.device.ipAddress).to.be.equals('10.11.12.13');
            }
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

    it('should add and update 1 device', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.device.name === 'Name') {
                expect(data.device.ipAddress).to.be.equals('10.11.12.13');
                socket.emit(protocolClient.UPD.name, {
                    device: {
                        id: data.device.id,
                        name: 'newname',
                        protocol: 'wss',
                        ip4Address: '11.12.13.14',
                        port: 3002,
                        state: 'running'
                    }
                });
            } else if (data.device.name === 'newname') {
                expect(data.device.ipAddress).to.be.equals('11.12.13.14');
                socket.emit(protocolClient.DEL.name, {device: {id: data.device.id}});
            }

            if (data.device.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
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
/*
    it('should return response for empty refresh all request', function (done) {
        var DEVICES_COUNT = 15;
        var idxDevice = 1;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (idxDevice++ > DEVICES_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });
*/
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
        socket.emit(protocolClient.UPD.name, {device: {id: 1}});
    });
});