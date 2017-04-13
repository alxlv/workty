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
var protocolClient = rootRequire('shared/protocols/v1/client-sv-workties.module').OPERATIONS;
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

describe('Workty context supervisor', function () {
    var socket;
    var user = request.agent();
    var Workties = [];
    var ContextName = 'workties';
    var WORKTIES_COUNT = 5;

    console.log('Run Workty context supervisor tests for version ' + ApiPrefix + '/' + SubVersion);

    // Run once before the first test case
    before(function (done) {
        this.timeout(5000);

        // Get all account (supervisor should be first)
        adminClient.get(ApiPrefix + '/accounts', function (err, req, res, data) {
            if (err) {
                return done(err);
            }

            // Login
            user
                .post(config.client.getConnectionString() + '/')
                .send({
                    email: config.supervisor.email,
                    password: config.supervisor.password
                })
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

    it('should add 5 workties', function (done) {
        var idxWorkty = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            Workties.push(data.workty);
            if (++idxWorkty === WORKTIES_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < WORKTIES_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.ADD.name, {
                    workty: {
                        name: 'Name_' + i,
                        desc: 'MyDesc_' + i
                    }
                });
            })(idx);
        }
    });

    //Refresh all code changes the positions of elements in array, that's why this test goes first
    it('should return 1 workty', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.workty.id).to.be.equals(Workties[0].id);
            expect(data.workty.name).to.be.equals(Workties[0].name);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {workty: {id: Workties[0].id}});
    });

    it('should return 5 workties', function (done) {
        var idxWorkty = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (++idxWorkty === WORKTIES_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should delete 5 workties', function (done) {
        var idxWorkty = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workty && data.workty.deleted) {
                expect(data.workty.deleted).to.be.equals(true);
                if (++idxWorkty === WORKTIES_COUNT) {
                    socket.off(protocolClient.CHANGED, _onDataReceived);
                    done();
                }
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < WORKTIES_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.DEL.name, {workty: {id: Workties[i].id}});
            })(idx);
        }
    });

    it('should add and delete 1 workty', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            socket.emit(protocolClient.DEL.name, {workty: {id: data.workty.id}});
            if (data.workty.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else {
                expect(data.workty.name).to.be.equals('Name');
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workty: {
                name: 'Name',
                desc: 'MyDesc',
                price: 0,
                discountPercent: 0
            }
        });
    });

    it('should add and update 1 workty', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workty.name === 'Name') {
                expect(data.workty.desc).to.be.equals('MyDesc');
                socket.emit(protocolClient.UPD.name, {
                    workty: {
                        id: data.workty.id,
                        name: 'newname',
                        desc: 'MyNewDesc',
                        price: 10,
                        discountPercent: 50
                    }
                });
            } else if (data.workty.name === 'newname') {
                expect(data.workty.desc).to.be.equals('MyNewDesc');
                socket.emit(protocolClient.DEL.name, {workty: {id: data.workty.id}});
            }

            if (data.workty.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workty: {
                name: 'Name',
                desc: 'MyDesc',
                entryPointModuleFileName: 'app.js',
                price: 0,
                discountPercent: 0
            }
        });
    });

    it('should add 1 workty property', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workty.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else if (data.workty.propertiesIds.length === 0) {
                expect(data.workty.name).to.be.equals('Name');
                socket.emit(protocolClient.ADD_PROPERTY.name, {
                    workty: {
                        id: data.workty.id,
                        property: {name: 'PropertyName', value: 'PropertyValue'}
                    }
                });
            } else {
                expect(data.workty.propertiesIds[0].name).to.be.equals('PropertyName');
                expect(data.workty.propertiesIds[0].value).to.be.equals('PropertyValue');
                socket.emit(protocolClient.DEL.name, {workty: {id: data.workty.id}});
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workty: {
                name: 'Name',
                desc: 'MyDesc',
                price: 0,
                discountPercent: 0
            }
        });
    });

    it('should add and update 1 workty property', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workty.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else if (data.workty.propertiesIds.length === 0) {
                expect(data.workty.name).to.be.equals('Name');
                socket.emit(protocolClient.ADD_PROPERTY.name, {
                    workty: {
                        id: data.workty.id,
                        property: {name: 'PropertyName', value: 'PropertyValue'}
                    }
                });
            } else {
                if (data.workty.propertiesIds[0].name === 'PropertyName') {
                    expect(data.workty.propertiesIds[0].value).to.be.equals('PropertyValue');
                    socket.emit(protocolClient.UPD_PROPERTY.name, {
                        workty: {
                            id: data.workty.id,
                            property: {
                                id: data.workty.propertiesIds[0].id,
                                name: 'NewPropertyName',
                                value: 'NewPropertyValue'
                            }
                        }
                    });
                } else {
                    expect(data.workty.propertiesIds[0].name).to.be.equals('NewPropertyName');
                    expect(data.workty.propertiesIds[0].value).to.be.equals('NewPropertyValue');
                    socket.emit(protocolClient.DEL.name, {workty: {id: data.workty.id}});
                }
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workty: {
                name: 'Name',
                desc: 'MyDesc',
                price: 0,
                discountPercent: 0
            }
        });
    });

    it('should add and delete 1 workty property', function (done) {
        var added = false;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workty.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else if (data.workty.propertiesIds.length === 0) {
                if (!added) {
                    expect(data.workty.name).to.be.equals('Name');
                    added = true;
                    socket.emit(protocolClient.ADD_PROPERTY.name, {
                        workty: {
                            id: data.workty.id,
                            property: {name: 'PropertyName', value: 'PropertyValue'}
                        }
                    });
                } else {
                    socket.emit(protocolClient.DEL.name, {workty: {id: data.workty.id}});
                }
            } else {
                if (data.workty.propertiesIds[0].name === 'PropertyName') {
                    expect(data.workty.propertiesIds[0].value).to.be.equals('PropertyValue');
                    socket.emit(protocolClient.DEL_PROPERTY.name, {
                        workty: {
                            id: data.workty.id,
                            property: {id: data.workty.propertiesIds[0].id}
                        }
                    });
                }
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workty: {
                name: 'Name',
                desc: 'MyDesc',
                price: 0,
                discountPercent: 0
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

    it('should return 400 response for empty add property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD_PROPERTY.name, {});
    });

    it('should return 400 response for empty update property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD_PROPERTY.name, {});
    });

    it('should return 400 response for empty delete property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.DEL_PROPERTY.name, {});
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

    it('should return 400 response for incorrect add property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD_PROPERTY.name, {sdfsdf: {sasdad: 1}});
    });

    it('should return 400 response for incorrect update property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD_PROPERTY.name, {sdfsdf: {sasdad: 1}});
    });

    it('should return 400 response for incorrect delete property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.DEL_PROPERTY.name, {sdfsdf: {sasdad: 1}});
    });


    it('should return 500 response for incorrect id update workty property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD_PROPERTY.name, {workty: {id: 1, property: {id: 2}}});
    });
});