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
var config = rootRequire('config');
var protocolClient = rootRequire('shared/protocols/v1/client-sv-workflows.module').OPERATIONS;
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

describe('Workflow context supervisor', function() {
    var socket;
    var user = request.agent();
    var Workflows = [];
    var Workties = [];
    var ContextName = 'workflows';
    var WORKFLOWS_COUNT = 3;
    var WORKTIES_COUNT = 3;
    var WORKTIES_FILENAMES = ['clouding/nodejs/facebook-generic.zip'];
    var account;

    console.log('Run Workflow context supervisor tests for version ' + ApiPrefix + '/' + SubVersion);

    function _createPromises(callback, count) {
        var promises = [];

        for (var idx = 0; idx < count; idx++) {
            promises.push(callback(idx));
        }

        return promises;
    }

    function _createWorkty(idx) {
        return new Promise(function (resolve, reject) {
            try {
                var compressedCode = fs.readFileSync(WorktyRepositoryCodePath + '/' + WORKTIES_FILENAMES[0]);
                adminClient.post(ApiPrefix + '/workties', {
                    name: 'myworkty' + idx,
                    desc: 'worktydesc' + idx,
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

    function _deleteWorkty(idx) {
        return new Promise(function (resolve, reject) {
            try {
                adminClient.del(ApiPrefix + '/workties/' + Workties[idx]._id, function (err, req, res, data) {
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

        // Create workties
        Promise.all(_createPromises(_createWorkty, WORKTIES_COUNT)).then(function (results) {
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
                    .post(config.client.getConnectionString())
                    .send({email: config.supervisor.getEmail(), password: config.supervisor.getPassword()})
                    .end(function (err, res) {
                        if (err) {
                            return done(err);
                        }

                        account = _getAccount(data[0]);

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

                        return done();
                    });
            });
        });
    });

    // Run once after the last test case
    after(function (done) {
        // Delete workties
        Promise.all(_createPromises(_deleteWorkty, WORKTIES_COUNT)).then(function (results) {
             for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
             }
         }).done(function (err) {
            expect(err).to.be.undefined;

            // Logout
            user.get(config.client.getConnectionString() + '/logout')
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

    it('should add 3 workflows', function (done) {
        var idxWorkflow = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            Workflows.push(data.workflow);
            if (++idxWorkflow === WORKFLOWS_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < WORKFLOWS_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.ADD.name, {
                    workflow: {
                        name: 'Name_' + i,
                        desc: 'MyDesc_' + i,
                        accountId: account.id
                    }
                });
            })(idx);
        }
    });

    //Refresh all code changes the positions of elements in array, that's why this test goes first
    it('should return 1 workflow', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.workflow.id).to.be.equals(Workflows[0].id);
            expect(data.workflow.name).to.be.equals(Workflows[0].name);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH.name, {workflow: {id: Workflows[0].id}});
    });

    it('should return 3 workflows', function (done) {
        var idxWorkflow = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (++idxWorkflow === WORKFLOWS_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.REFRESH_ALL.name, {});
    });

    it('should delete 3 workflows', function (done) {
        var idxWorkflow = 0;

        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            expect(data.workflow.deleted).to.be.equals(true);
            if (++idxWorkflow === WORKFLOWS_COUNT) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);

        for (var idx = 0; idx < WORKFLOWS_COUNT; idx++) {
            (function (i) {
                socket.emit(protocolClient.DEL.name, {workflow: {id: Workflows[i].id}});
            })(idx);
        }
    });

    it('should add and delete 1 workflow', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            socket.emit(protocolClient.DEL.name, {workflow: {id: data.workflow.id}});
            if (data.workflow.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else {
                expect(data.workflow.name).to.be.equals('Name');
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {workflow: {name: 'Name', desc: 'MyDesc'}});
    });

    it('should add and update 1 workflow', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workflow.name === 'Name') {
                expect(data.workflow.desc).to.be.equals('MyDesc');
                socket.emit(protocolClient.UPD.name, {
                    workflow: {
                        id: data.workflow.id,
                        name: 'newname',
                        desc: 'MyNewDesc'
                    }
                });
            } else if (data.workflow.name === 'newname') {
                expect(data.workflow.desc).to.be.equals('MyNewDesc');
                socket.emit(protocolClient.DEL.name, {workflow: {id: data.workflow.id}});
            }

            if (data.workflow.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {workflow: {name: 'Name', desc: 'MyDesc'}});
    });

    it('should add 1 workty instance', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workflow.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else if (data.workflow.worktiesInstances.length === 0) {
                expect(data.workflow.desc).to.be.equals('MyWorkflowTest0');
                socket.emit(protocolClient.ADD_WORKTY_INSTANCE.name, {
                    workflow: {
                        id: data.workflow.id,
                        worktyInstance: {desc: 'MyWorktyInstanceDesc'}
                    }, workty: {id: Workties[0]._id}
                });
            } else {
                expect(data.workflow.worktiesInstances[0].desc).to.be.equals('MyWorktyInstanceDesc');
                socket.emit(protocolClient.DEL.name, {workflow: {id: data.workflow.id}});
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workflow: {name: 'MyWorkflow0', desc: 'MyWorkflowTest0'},
            accountId: account.id
        });
    });

    it('should add and update 1 workty instance', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workflow.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else if (data.workflow.worktiesInstances.length === 0) {
                expect(data.workflow.desc).to.be.equals('MyWorkflowTest1');
                socket.emit(protocolClient.ADD_WORKTY_INSTANCE.name, {
                    workflow: {
                        id: data.workflow.id,
                        worktyInstance: {desc: 'MyWorktyInstanceDesc'}
                    }, workty: {id: Workties[0]._id}
                });
            } else {
                if (data.workflow.worktiesInstances[0].desc === 'MyWorktyInstanceDesc') {
                    socket.emit(protocolClient.UPD_WORKTY_INSTANCE.name, {
                        workflow: {
                            id: data.workflow.id,
                            worktyInstance: {
                                id: data.workflow.worktiesInstances[0].id,
                                desc: 'MyWorktyInstanceDesc2'
                            }
                        }, embed: 'state,properties'
                    });
                } else {
                    expect(data.workflow.worktiesInstances[0].desc).to.be.equals('MyWorktyInstanceDesc2');
                    socket.emit(protocolClient.DEL.name, {workflow: {id: data.workflow.id}});
                }
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workflow: {name: 'MyWorkflow1', desc: 'MyWorkflowTest1'},
            accountId: account.id
        });
    });

    it('should add and delete 1 workty instance', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workflow.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else if (data.workflow.worktiesInstances.length === 0) {
                expect(data.workflow.desc).to.be.equals('MyWorkflowTest2');
                socket.emit(protocolClient.ADD_WORKTY_INSTANCE.name, {
                    workflow: {
                        id: data.workflow.id,
                        worktyInstance: {desc: 'MyWorktyInstanceDesc'}
                    }, workty: {id: Workties[0]._id}
                });
            } else if (data.workflow.worktiesInstances[0].worktyInstanceDeleted) {
                socket.emit(protocolClient.DEL.name, {workflow: {id: data.workflow.id}});
            } else {
                expect(data.workflow.worktiesInstances[0].desc).to.be.equals('MyWorktyInstanceDesc');
                socket.emit(protocolClient.DEL_WORKTY_INSTANCE.name, {
                    workflow: {
                        id: data.workflow.id,
                        worktyInstance: {id: data.workflow.worktiesInstances[0].id}
                    }
                });
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workflow: {name: 'MyWorkflow2', desc: 'MyWorkflowTest2'},
            accountId: account.id
        });
    });

    it('should add, update 1 workty instance property', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.be.null;
            if (data.workflow.deleted) {
                socket.off(protocolClient.CHANGED, _onDataReceived);
                done();
            } else if (data.workflow.worktiesInstances.length === 0) {
                expect(data.workflow.desc).to.be.equals('MyWorkflowTest3');
                socket.emit(protocolClient.ADD_WORKTY_INSTANCE.name, {
                    workflow: {
                        id: data.workflow.id,
                        worktyInstance: {desc: 'MyWorktyInstanceDesc'}
                    }, workty: {id: Workties[0]._id}
                });
            } else {
                expect(data.workflow.worktiesInstances[0].desc).to.be.equals('MyWorktyInstanceDesc');
                if (data.workflow.worktiesInstances[0].propertiesIds.length > 0) {
                    if (data.workflow.worktiesInstances[0].propertiesIds[0].name === 'PropertyName') {
                        var property = {};
                        property.id = data.workflow.worktiesInstances[0].propertiesIds[0].id;
                        property.name = 'NewPropertyName';
                        property.value = 'NewPropertyValue';
                        socket.emit(protocolClient.UPD_WORKTY_INSTANCE_PROPERTY.name, {
                            workflow: {
                                id: data.workflow.id,
                                worktyInstance: {id: data.workflow.worktiesInstances[0].id, property: property}
                            }
                        });
                    } else {
                        expect(data.workflow.worktiesInstances[0].propertiesIds[0].name).to.be.equals('NewPropertyName');
                        expect(data.workflow.worktiesInstances[0].propertiesIds[0].value).to.be.equals('NewPropertyValue');
                        socket.emit(protocolClient.DEL.name, {workflow: {id: data.workflow.id}});
                    }
                }
            }
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD.name, {
            workflow: {name: 'MyWorkflow3', desc: 'MyWorkflowTest3'},
            accountId: account.id
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

    it('should return 400 response for empty run request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.RUN.name, {});
    });

    it('should return 400 response for empty pause request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.PAUSE.name, {});
    });

    it('should return 400 response for empty stop request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.STOP.name, {});
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

    it('should return 400 response for incorrect add workty instance request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.ADD_WORKTY_INSTANCE.name, {sdfsdf: {sasdad: 1}});
    });

    it('should return 400 response for incorrect update workty instance request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD_WORKTY_INSTANCE.name, {sdfsdf: {sasdad: 1}});
    });

    it('should return 400 response for incorrect delete workty instance request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.DEL_WORKTY_INSTANCE.name, {sdfsdf: {sasdad: 1}});
    });

    it('should return 400 response for incorrect update workty instance property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(400);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD_WORKTY_INSTANCE_PROPERTY.name, {sdfsdf: {sasdad: 1}});
    });

    it('should return 500 response for incorrect id update workty instance property request', function (done) {
        function _onDataReceived(data) {
            expect(data.err).to.not.be.null;
            expect(data.err.statusCode).to.be.equals(500);
            socket.off(protocolClient.CHANGED, _onDataReceived);
            done();
        }

        socket.on(protocolClient.CHANGED, _onDataReceived);
        socket.emit(protocolClient.UPD_WORKTY_INSTANCE_PROPERTY.name, {
            workflow: {
                id: 1,
                worktyInstance: {id: 2, property: {id: 3}}
            }
        });
    });
});
