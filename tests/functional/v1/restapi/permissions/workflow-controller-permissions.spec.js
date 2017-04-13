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

var restify = require('restify');
var _ = require('lodash');
var expect = require('chai').expect;
var ApiPrefix = '/api/v1';
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

describe('Workflow permissions for Rest API', function () {
    var Accounts = [];
    var Clients = [];
    var AccountsPerPage = 1;
    var SuperuserWorkflowsPerPage = 1;
    var RegularuserWorkflowsPerPage = 2;
    var WorktiesPerPage = 1;
    var SuperuserWorkties = [];
    var RegularuserWorkties = [];
    var SuperuserWorkflows = [];
    var SuperuserWorktiesInstances = [];
    var RegularuserWorkflows = [];
    var RegularuserWorktiesInstances = [];
    var RegularuserPayments = [];

    console.log('Run Workflow permissions for Rest API tests for version ' + ApiPrefix + '/' + SubVersion);

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
                params.client.post(ApiPrefix + '/workties', {
                    name: 'myworkty' + params.idx,
                    desc: 'worktydesc' + params.idx,
                    template: true
                }, function (err, req, res, data) {
                    var workty = data;
                    params.client.post(ApiPrefix + '/workties/' + data._id + '/properties', {
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

    function _copyWorkty(params) {
        return new Promise(function (resolve, reject) {
            try {
                params.client.post(ApiPrefix + '/payments', {worktyId: params.workties[params.idx]._id}, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _getWorkty(params) {
        return new Promise(function (resolve, reject) {
            try {
                // Get workty
                params.client.get(ApiPrefix + '/workties/' + params.workties[params.idx]._id + '?embed=properties', function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _createWorkflow(params) {
        return new Promise(function (resolve, reject) {
            try {
                params.client.post(ApiPrefix + '/workflows', {
                    name: 'myworkflow' + params.idx,
                    desc: 'workflowdesc' + params.idx
                }, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _createWorktyInstance(params) {
        return new Promise(function (resolve, reject) {
            try {
                params.client.post(ApiPrefix + '/workflows/' + params.workflows[params.idx]._id + '/worktiesInstances', {
                    desc: 'worktyinstance' + params.idx,
                    worktyId: params.workties[0]._id,
                    embed: 'properties'
                }, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    // Delete workflows and workties
    function _deleteWorkty(params) {
        return new Promise(function (resolve, reject) {
            try {
                params.client.del(ApiPrefix + '/workties/' + params.workties[params.idx]._id, function (err, req, res, data) {
                    resolve({res: res});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _deleteWorkflow(params) {
        return new Promise(function (resolve, reject) {
            try {
                params.client.del(ApiPrefix + '/workflows/' + params.workflows[params.idx]._id, function (err, req, res, data) {
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
                adminClient.del(ApiPrefix + '/accounts/' + params.accounts[params.idx]._id + '?removing=true', function (err, req, res, data) {
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
                params.client.del(ApiPrefix + '/payments/' + params.payments[params.idx]._id, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    // Run once before the first test case
    before(function (done) {
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

            return Promise.all(_createPromises(_createWorkty, {count: WorktiesPerPage, client: adminClient}));
        }).then(function (results) { // Create admin workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                SuperuserWorkties.push(data);
            }

            return Promise.all(_createPromises(_copyWorkty, {
                count: WorktiesPerPage,
                client: Clients[0],
                workties: SuperuserWorkties
            }));
        }).then(function (results) { // Create regular user workties
            var workties = [];

            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                workties.push({_id: data.worktyId});
                RegularuserPayments.push(data);
            }

            return Promise.all(_createPromises(_getWorkty, {
                count: WorktiesPerPage,
                client: Clients[0],
                workties: workties
            }));
        }).then(function (results) { // Get regular user workties with properties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                RegularuserWorkties.push(data);
            }

            return Promise.all(_createPromises(_createWorkflow, {
                count: SuperuserWorkflowsPerPage,
                client: adminClient
            }));
        }).then(function (results) { // Create admin workflow
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                SuperuserWorkflows.push(data);
            }

            return Promise.all(_createPromises(_createWorkflow, {
                count: RegularuserWorkflowsPerPage,
                client: Clients[0]
            }));
        }).then(function (results) { // Create regular user workflow
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                RegularuserWorkflows.push(data);
            }

            return Promise.all(_createPromises(_createWorktyInstance, {
                count: SuperuserWorkflowsPerPage,
                workflows: SuperuserWorkflows,
                workties: SuperuserWorkties,
                client: adminClient
            }));
        }).then(function (results) { // Create supervisor workties instances
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                SuperuserWorktiesInstances.push(data);
            }

            return Promise.all(_createPromises(_createWorktyInstance, {
                count: RegularuserWorkflowsPerPage,
                workflows: RegularuserWorkflows,
                workties: RegularuserWorkties,
                client: Clients[0]
            }));
        }).then(function (results) { // Create regular user workties instances
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                RegularuserWorktiesInstances.push(data);
            }
        }).done(function (err) {
            expect(err).to.be.undefined;
            done();
        });
    });

    // Run once after the last test case
    after(function (done) {
        Promise.all(_createPromises(_deleteWorkty, {
                count: WorktiesPerPage,
                workties: SuperuserWorkties,
                client: adminClient
            })
        ).then(function (results) { // Delete admin workties
                for (var idx = 0; idx < results.length; idx++) {
                    var res = results[idx].res;
                    expect(res.statusCode).to.equals(204);
                }

                return Promise.all(_createPromises(_deleteWorkty, {
                    count: WorktiesPerPage,
                    workties: RegularuserWorkties,
                    client: adminClient
                }));
            }).then(function (results) { // Delete Regularuser workties
                for (var idx = 0; idx < results.length; idx++) {
                    var res = results[idx].res;
                    expect(res.statusCode).to.equals(204);
                }

                return Promise.all(_createPromises(_deleteWorkflow, {
                    count: SuperuserWorkflowsPerPage,
                    workflows: SuperuserWorkflows,
                    client: adminClient
                }));
            }).then(function (results) { // Delete admin workflow
                for (var idx = 0; idx < results.length; idx++) {
                    var res = results[idx].res;
                    expect(res.statusCode).to.equals(204);
                }

                return Promise.all(_createPromises(_deleteWorkflow, {
                    count: RegularuserWorkflowsPerPage,
                    workflows: RegularuserWorkflows,
                    client: Clients[0]
                }));
            }).then(function (results) { // Delete regular user workflows
                for (var idx = 0; idx < results.length; idx++) {
                    var res = results[idx].res;
                    expect(res.statusCode).to.equals(204);
                }

                return Promise.all(_createPromises(_deletePayment, {
                    count: RegularuserPayments.length,
                    client: adminClient,
                    payments: RegularuserPayments
                }));
            }).then(function (results) { // Delete regular user payments
                for (var idx = 0; idx < results.length; idx++) {
                    var res = results[idx].res;
                    expect(res.statusCode).to.equals(204);
                }

                return Promise.all(_createPromises(_deleteAccount, {count: AccountsPerPage, accounts: Accounts}));
            }).then(function (results) { // Delete accounts
                for (var idx = 0; idx < results.length; idx++) {
                    var res = results[idx].res;
                    expect(res.statusCode).to.equals(204);
                }
            }).done(function (err) {
                expect(err).to.be.undefined;
                done();
            });
    });

    describe('.getAll()', function () {
        it('should get 2', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/workflows', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(RegularuserWorkflowsPerPage); // regular user workflows
                done();
            });
        });

        it('should get 3', function (done) {
            adminClient.get(ApiPrefix + '/workflows', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(SuperuserWorkflowsPerPage + RegularuserWorkflowsPerPage); // admin and regular user workflows
                done();
            });
        });
    });

    describe('.getById()', function () {
        it('should get a 200 response', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get records-count', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '?count=true', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('1');
                done();
            });
        });
    });

    describe('.add()', function () {
        it('should get a 201 response', function (done) {
            // Create workflow
            var client = Clients[0];
            client.post(ApiPrefix + '/workflows', {
                name: 'mytestworkflow0',
                desc: 'testworkflow0'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var workflowId = data._id;
                expect(res.headers.location).to.have.string('/' + workflowId);
                expect(data.name).to.be.equal('mytestworkflow0');
                expect(data.desc).to.be.equal('testworkflow0');
                // Delete workflow
                client.del(res.headers.location, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });

    describe('.update()', function () {
        it('should get a 200 response', function (done) {
            var client = Clients[0];
            client.put(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id, {
                name: 'mytestworkflow1',
                desc: 'testworkflow1'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.null;
                var workflowId = data._id;
                expect(workflowId).to.equals(RegularuserWorkflows[0]._id);
                expect(data.name).to.be.equal('mytestworkflow1');
                expect(data.desc).to.be.equal('testworkflow1');
                done();
            });
        });
    });

    describe('.del()', function () {
        it('should get a 204 response', function (done) {
            // Create workflow
            var client = Clients[0];
            client.post(ApiPrefix + '/workflows', {
                name: 'mytestworkflow2',
                desc: 'testworkflow2'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var workflowId = data._id;
                expect(res.headers.location).to.have.string('/' + workflowId);
                // Delete workflow
                client.del(ApiPrefix + '/workflows/' + workflowId, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(data).is.empty;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });

    describe('.run()', function () {
        it('should get a 200 response', function (done) {
            var client = Clients[0];
            client.put(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/running', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });
    });

    describe('.stop()', function () {
        it('should get a 200 response', function (done) {
            var client = Clients[0];
            client.del(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/running', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                done();
            });
        });
    });

    describe('.resume()', function () {
        it('should get a 200 response', function (done) {
            // Resume workflow
            var client = Clients[0];
            client.put(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/running', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });
    });

    describe('Workties instances', function () {
        describe('.getAllWorktiesInstances()', function () {
            it('should get a 200 response', function (done) {
                var client = Clients[0];
                client.get(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/worktiesInstances', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.have.length.above(0);
                    expect(data[0].workflowId).to.equals(RegularuserWorkflows[0]._id);
                    done();
                });
            });

            it('should get 2', function (done) {
                var client = Clients[0];
                client.get(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/worktiesInstances?per_page=2', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.have.length(1);
                    done();
                });
            });
        });

        describe('.getWorktyInstanceById()', function () {
            it('should get a 200 response', function (done) {
                var client = Clients[0];
                client.get(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/worktiesInstances/' + RegularuserWorktiesInstances[0]._id, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.empty;
                    done();
                });
            });
        });

        describe('.addWorktyInstance()', function () {
            it('should get a 201 response', function (done) {
                // Create workty instance
                var client = Clients[0];
                client.post(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/worktiesInstances', {
                    desc: 'descworktyinstance4',
                    worktyId: RegularuserWorkties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(201);
                    expect(res.headers).to.contain.keys('location');
                    expect(data).to.not.be.null;
                    expect(data.worktyId).to.be.equal(RegularuserWorkties[0]._id);
                    expect(data.desc).to.be.equal('descworktyinstance4');
                    // Delete workty instance
                    client.del(res.headers.location, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        describe('.updateWorktyInstance()', function () {
            it('should get a 200 response', function (done) {
                var client = Clients[0];
                client.put(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/worktiesInstances/' + RegularuserWorktiesInstances[0]._id, {desc: 'updateddesc'}, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.null;
                    expect(data.desc).to.be.equal('updateddesc');
                    done();
                });
            });
        });

        describe('.delWorktyInstance()', function () {
            it('should get a 204 response', function (done) {
                // Create workty instance
                var client = Clients[0];
                client.post(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/worktiesInstances', {
                    desc: 'testworkty',
                    worktyId: RegularuserWorkties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(201);
                    expect(res.headers).to.contain.keys('location');
                    expect(data).to.not.be.null;
                    var workflowId = data.workflowId;
                    var worktyInstanceId = data._id;
                    expect(res.headers.location).to.have.string('/' + workflowId);
                    // Delete workty instance
                    client.del(ApiPrefix + '/workflows/' + workflowId + '/worktiesInstances/' + worktyInstanceId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        describe('.updateWorktyInstanceProperty()', function () {
            it('should get a 200 response', function (done) {
                var client = Clients[0];
                client.put(ApiPrefix + '/workflows/' + RegularuserWorkflows[0]._id + '/worktiesInstances/' + RegularuserWorktiesInstances[0]._id + '/properties/' + RegularuserWorktiesInstances[0].propertiesIds[0]._id, {
                    name: 'NewPropertyName',
                    value: 'NewPropertyValue'
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data.name).to.be.equal('NewPropertyName');
                    expect(data.value).to.be.equal('NewPropertyValue');
                    done();
                });
            });
        });
    });
});