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
var fs = require('fs');
var expect = require('chai').expect;
var ApiPrefix = '/api/v1';
var Promise = require('promise');
var config = rootRequire('config');
var util = require('util');
var WorktyRepositoryCodePath = RootFolder + '/workties-repository';
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

describe('Workflow Rest API', function () {
    var WorkflowsPerPage = 3;
    var Workflows = [];
    var WorktiesPerPage = 2;
    var Workties = [];
    var WorktiesInstances = [];
    var WORKTIES_FILENAMES = ['unsorted/nodejs/unit-tests/without-delay.zip'];

    console.log('Run Workflow API tests for version ' + ApiPrefix + '/' + SubVersion);

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

    function _createWorkflow(idx) {
        return new Promise(function (resolve, reject) {
            try {
                adminClient.post(ApiPrefix + '/workflows', {
                    name: 'myworkflow' + idx,
                    desc: 'workflowdesc' + idx
                }, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _createWorktyInstance(idx) {
        return new Promise(function (resolve, reject) {
            try {
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances', {
                    name: 'worktyinstance' + idx,
                    desc: 'worktyinstance' + idx,
                    worktyId: Workties[idx]._id,
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

    function _deleteWorkflow(idx) {
        return new Promise(function (resolve, reject) {
            try {
                adminClient.del(ApiPrefix + '/workflows/' + Workflows[idx]._id, function (err, req, res, data) {
                    resolve({res: res});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    // Run once before the first test case
    before(function (done) {
        Promise.all(_createPromises(_createWorkty, WorktiesPerPage)).then(function (results) { // Create workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                Workties.push(data);
            }

            return Promise.all(_createPromises(_createWorkflow, WorkflowsPerPage));
        }).then(function (results) { // Create workflows
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                Workflows.push(data);
            }

            return Promise.all(_createPromises(_createWorktyInstance, WorktiesPerPage));
        }).then(function (results) { // Create workties instances
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                WorktiesInstances.push(data);
            }
        }).done(function (err) {
            expect(err).to.be.undefined;
            done();
        });
    });

    // Run once after the last test case
    after(function (done) {
        Promise.all(_createPromises(_deleteWorkty, WorktiesPerPage)).then(function (results) { // Delete workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            return Promise.all(_createPromises(_deleteWorkflow, WorkflowsPerPage));
        }).then(function (results) { // Delete workflows
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
        it('should get a 200 response', function (done) {
            adminClient.get(ApiPrefix + '/workflows', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length.above(1);
                done();
            });
        });

        it('should get 3', function (done) {
            adminClient.get(ApiPrefix + '/workflows?page_num=1&per_page=3', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                done();
            });
        });

        it('should get 2', function (done) {
            adminClient.get(ApiPrefix + '/workflows?per_page=2', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(2);
                done();
            });
        });

        it('should get records-count', function (done) {
            adminClient.get(ApiPrefix + '/workflows?per_page=3&count=true', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('3');
                done();
            });
        });

        it('should get sorted', function (done) {
            adminClient.get(ApiPrefix + '/workflows?per_page=3&sort=_id', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                expect(data).to.satisfy(function (workflows) {
                    var currentValue = null;
                    _.each(workflows, function (workflow) {
                        if (!currentValue) {
                            currentValue = workflow._id;
                        } else {
                            if (workflow._id <= currentValue) expect(true).to.be.false();
                            currentValue = workflow._id;
                        }
                    });
                    return true;
                });
                done();
            });
        });

        it('should get fields', function (done) {
            adminClient.get(ApiPrefix + '/workflows?per_page=3&fields=_id,name,desc', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                expect(data).to.satisfy(function (workflows) {
                    _.each(workflows, function (workflow) {
                        expect(workflow).to.have.keys(['_id', 'name', 'desc']);
                    });
                    return true;
                });
                done();
            });
        });

        it('should get embed fields', function (done) {
            adminClient.get(ApiPrefix + '/workflows?per_page=3&embed=worktiesInstances,account', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                expect(data).to.satisfy(function (workflows) {
                    _.each(workflows, function (workflow) {
                        expect(workflow).to.contain.keys('accountId', 'worktiesInstancesIds');
                        expect(workflow.accountId).to.contain.keys('_id');
                        if (workflow.worktiesInstancesIds.length > 0) {
                            expect(workflow.worktiesInstancesIds[0]).to.contain.keys('_id');
                        }
                    });
                    return true;
                });
                done();
            });
        });
    });

    describe('.getById()', function () {
        it('should get a 200 response', function (done) {
            adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get a 500 response not found', function (done) {
            adminClient.get(ApiPrefix + '/workflows/' + 'N', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys('error');
                expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                expect(data.error.code).to.equals(1);
                expect(data.error.error_link).to.not.be.empty;
                expect(data.error.message).to.not.be.empty;
                done();
            });
        });

        it('should get records-count', function (done) {
            adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '?count=true', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('1');
                done();
            });
        });

        it('should get fields', function (done) {
            adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '?fields=_id,name,desc', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys(['_id', 'name', 'desc']);
                done();
            });
        });

        it('should get embed fields', function (done) {
            adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '?embed=worktiesInstances,account', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(data).to.contain.keys('accountId', 'worktiesInstancesIds');
                expect(data.accountId).to.contain.keys('_id');
                if (data.worktiesInstancesIds.length > 0) {
                    expect(data.worktiesInstancesIds[0]).to.contain.keys('_id');
                }
                done();
            });
        });
    });

    describe('.add()', function () {
        it('should get a 409 response', function (done) {
            adminClient.post(ApiPrefix + '/workflows', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(409);
                var error = JSON.parse(err.message).error;
                expect(error.message).to.equals("Validation Error");
                expect(error.errors).to.have.length(1);
                expect(error.errors[0].message).to.equals("Path `name` is required.");
                done();
            });
        });

        it('should get a 201 response', function (done) {
            // Create workflow
            adminClient.post(ApiPrefix + '/workflows', {
                name: 'mytestworkflow',
                desc: 'testworkflow'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var workflowId = data._id;
                expect(res.headers.location).to.have.string('/' + workflowId);
                expect(data.name).to.be.equal('mytestworkflow');
                expect(data.desc).to.be.equal('testworkflow');
                // Delete workflow
                adminClient.del(res.headers.location, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });

    describe('.update()', function () {
        it('should get a 400 response', function (done) {
            adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id, function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(400);
                var error = JSON.parse(err.message).error;
                expect(error.errors).is.empty;
                done();
            });
        });

        it('should get a 409 response', function (done) {
            adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id, {name: ''}, function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(409);
                var error = JSON.parse(err.message).error;
                expect(error.errors).to.have.length(1);
                expect(error.errors[0].message).to.equals("Path `name` is required.");
                done();
            });
        });

        it('should get a 200 response', function (done) {
            adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id, {
                name: 'mytestworkflow',
                desc: 'testworkflow'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.null;
                var workflowId = data._id;
                expect(workflowId).to.equals(Workflows[0]._id);
                expect(data.name).to.be.equal('mytestworkflow');
                expect(data.desc).to.be.equal('testworkflow');
                done();
            });
        });
    });

    describe('.del()', function () {
        it('should get a 500 response not found', function (done) {
            // Delete workflow
            adminClient.del(ApiPrefix + '/workflows/' + Workflows[0]._id + 'N', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });

        it('should get a 204 response', function (done) {
            // Create workflow
            adminClient.post(ApiPrefix + '/workflows', {
                name: 'mytestworkflow',
                desc: 'testworkflow'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var workflowId = data._id;
                expect(res.headers.location).to.have.string('/' + workflowId);
                // Delete workflow
                adminClient.del(ApiPrefix + '/workflows/' + workflowId, function (err, req, res, data) {
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
            adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + '/running', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get a 500 response not found', function (done) {
            adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + 'N' + '/running', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys('error');
                expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                expect(data.error.code).to.be.equals(1);
                expect(data.error.error_link).to.not.be.empty;
                expect(data.error.message).to.not.be.empty;
                done();
            });
        });

        describe('multiple workflows', function () {
            var WorkflowExtraPerPage = 2;
            var WorkflowExtraIds = [];

            function _deleteExtraWorkflow(idx) {
                return new Promise(function (resolve, reject) {
                    try {
                        adminClient.del(ApiPrefix + '/workflows/' + WorkflowExtraIds[idx], function (err, req, res, data) {
                            resolve({res: res});
                        });
                    } catch (ex) {
                        reject(ex);
                    }
                });
            }

            // Run once before the first test case
            before(function (done) {
                Promise.all(_createPromises(_createWorkflow, WorkflowExtraPerPage)).then(function (results) { // Create workflows
                    for (var idx = 0; idx < results.length; idx++) {
                        var res = results[idx].res;
                        var data = results[idx].data;
                        expect(res.statusCode).to.equals(201);
                        expect(data).to.not.be.empty;
                        WorkflowExtraIds.push(data._id);
                    }
                }).done(function (err) {
                    expect(err).to.be.undefined;
                    done();
                });
            });

            // Run once after the last test case
            after(function (done) {
                Promise.all(_createPromises(_deleteExtraWorkflow, WorkflowExtraPerPage)).then(function (results) { // Delete workflows
                    for (var idx = 0; idx < results.length; idx++) {
                        var res = results[idx].res;
                        expect(res.statusCode).to.equals(204);
                    }
                }).done(function (err) {
                    expect(err).to.be.undefined;
                    done();
                });
            });
        });
    });

    describe('.stop()', function () {
        it('should get a 200 response', function (done) {
            // Run workflow
            adminClient.del(ApiPrefix + '/workflows/' + Workflows[0]._id + '/running', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                done();
            });
        });

        it('should get a 500 response not found', function (done) {
            adminClient.del(ApiPrefix + '/workflows/' + Workflows[0]._id + 'N' + '/running', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys('error');
                expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                expect(data.error.code).to.be.equals(1);
                expect(data.error.error_link).to.not.be.empty;
                expect(data.error.message).to.not.be.empty;
                done();
            });
        });

        it('should get a 200 response after two stops', function (done) {
            // Run workflow
            adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + '/running', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                // Stop workflow twice
                adminClient.del(ApiPrefix + '/workflows/' + Workflows[0]._id + '/running', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    adminClient.del(ApiPrefix + '/workflows/' + Workflows[0]._id + '/running', function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(res.statusCode).to.equals(200);
                        done();
                    });
                });
            });
        });
    });

    describe('.resume()', function () {
        it('should get a 200 response', function (done) {
            // Resume workflow
            adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + '/running', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get a 500 response not found', function (done) {
            adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + 'N' + '/running', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys('error');
                expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                expect(data.error.code).to.be.equals(1);
                expect(data.error.error_link).to.not.be.empty;
                expect(data.error.message).to.not.be.empty;
                done();
            });
        });
    });

    describe('Workties instances', function () {
        describe('.getAllWorktiesInstances()', function () {
            it('should get a 200 response', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.have.length.above(0);
                    expect(data[0].workflowId).to.equals(Workflows[0]._id);
                    done();
                });
            });

            it('should get 2', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?per_page=2', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.have.length(2);
                    done();
                });
            });

            it('should get records-count', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?per_page=2&count=true', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.have.length(2);
                    expect(res.headers).to.contain.keys('records-count');
                    expect(res.headers['records-count']).equals('2');
                    done();
                });
            });

            it('should get fields', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?per_page=2&fields=_id,desc,created', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.have.length(2);
                    expect(data).to.satisfy(function (workflowInstances) {
                        _.each(workflowInstances, function (workflowInstance) {
                            expect(workflowInstance).to.have.keys(['_id', 'desc', 'created']);
                        });
                        return true;
                    });
                    done();
                });
            });

            it('should get embed fields', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?per_page=2&embed=workflow,state', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.have.length(2);
                    expect(data).to.satisfy(function (workflowInstances) {
                        _.each(workflowInstances, function (workflowInstance) {
                            expect(workflowInstance).to.contain.keys('stateId', 'workflowId');
                            expect(workflowInstance.workflowId).to.contain.keys('_id');
                            if (workflowInstance.stateId.length > 0) {
                                expect(workflowInstance.stateId[0]).to.contain.keys('_id');
                            }
                        });
                        return true;
                    });
                    done();
                });
            });
        });

        describe('.getWorktyInstanceById()', function () {
            it('should get a 200 response', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.empty;
                    done();
                });
            });

            it('should get a 500 response not found', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id + 'N', function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(500);
                    expect(data).to.not.be.empty;
                    expect(data).to.have.keys('error');
                    expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                    expect(data.error.code).to.equals(1);
                    expect(data.error.error_link).to.not.be.empty;
                    expect(data.error.message).to.not.be.empty;
                    done();
                });
            });

            it('should get records-count', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id + '?count=true', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.empty;
                    expect(res.headers).to.contain.keys('records-count');
                    expect(res.headers['records-count']).equals('1');
                    done();
                });
            });

            it('should get fields', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id + '?fields=_id,desc', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.empty;
                    expect(data).to.have.keys(['_id', 'desc']);
                    done();
                });
            });

            it('should get embed fields', function (done) {
                adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id + '?embed=workflow,state', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.empty;
                    expect(data).to.contain.keys('stateId', 'workflowId');
                    expect(data.stateId).to.contain.keys('_id');
                    expect(data.workflowId).to.contain.keys('_id');
                    expect(data.workflowId._id).to.equals(Workflows[0]._id);
                    done();
                });
            });
        });

        describe('.addWorktyInstance()', function () {
            it('should get a 201 response', function (done) {
                // Create workty instance
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances', {
                    desc: 'descworktyinstance4',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(201);
                    expect(res.headers).to.contain.keys('location');
                    expect(data).to.not.be.null;
                    expect(data.worktyId).to.be.equal(Workties[0]._id);
                    expect(data.desc).to.be.equal('descworktyinstance4');
                    // Delete workty instance
                    adminClient.del(res.headers.location, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });

            it('should get a 500 response with code 12 position type is unknown', function (done) {
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_type=unknown', {
                    desc: 'testworkty',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(500);
                    expect(data).to.have.keys('error');
                    expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                    expect(data.error.code).to.equals(12);
                    expect(data.error.error_link).to.not.be.empty;
                    expect(data.error.message).to.not.be.empty;
                    done();
                });
            });

            it('should get a 201 response for position type is last', function (done) {
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_type=last', {
                    desc: 'testworkty',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(201);
                    expect(res.headers).to.contain.keys('location');
                    expect(data).to.not.be.null;
                    var worktyInstanceId = data._id;
                    expect(res.headers.location).to.have.string('worktiesInstances/' + worktyInstanceId);
                    expect(data.desc).to.be.equal('testworkty');
                    var headerLocation = res.headers.location;
                    // Get workflow to check workty instance added in last position
                    adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(res.statusCode).to.equals(200);
                        expect(data).to.not.be.empty;
                        expect(data.worktiesInstancesIds).to.satisfy(function (worktiesInstancesIds) {
                            if (worktiesInstancesIds.length !== 3) {
                                return false;
                            }
                            return worktyInstanceId === worktiesInstancesIds[worktiesInstancesIds.length - 1];
                        });
                        // Delete workty instance
                        adminClient.del(headerLocation, function (err, req, res, data) {
                            expect(err).to.be.null;
                            expect(data).is.empty;
                            expect(res.statusCode).to.equals(204);
                            done();
                        });
                    });
                });
            });

            it('should get a 201 response for position type is first', function (done) {
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_type=first', {
                    desc: 'testworkty',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(201);
                    expect(res.headers).to.contain.keys('location');
                    expect(data).to.not.be.null;
                    var worktyInstanceId = data._id;
                    expect(res.headers.location).to.have.string('worktiesInstances/' + worktyInstanceId);
                    expect(data.desc).to.be.equal('testworkty');
                    var headerLocation = res.headers.location;
                    // Get workflow to check workty instance added in first position
                    adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(res.statusCode).to.equals(200);
                        expect(data).to.not.be.empty;
                        expect(data.worktiesInstancesIds).to.satisfy(function (worktiesInstancesIds) {
                            if (worktiesInstancesIds.length !== 3) {
                                return false;
                            }
                            return worktyInstanceId === worktiesInstancesIds[0];
                        });
                        // Delete workty instance
                        adminClient.del(headerLocation, function (err, req, res, data) {
                            expect(err).to.be.null;
                            expect(data).is.empty;
                            expect(res.statusCode).to.equals(204);
                            done();
                        });
                    });
                });
            });

            it('should get a 201 response for position index is 0 among 4 values', function (done) {
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_index=0', {
                    desc: 'testworkty',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(201);
                    expect(res.headers).to.contain.keys('location');
                    expect(data).to.not.be.null;
                    var worktyInstanceId = data._id;
                    expect(res.headers.location).to.have.string('worktiesInstances/' + worktyInstanceId);
                    expect(data.desc).to.be.equal('testworkty');
                    var headerLocation = res.headers.location;
                    // Get workflow to check workty instance added by index 1
                    adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(res.statusCode).to.equals(200);
                        expect(data).to.not.be.empty;
                        expect(data.worktiesInstancesIds).to.satisfy(function (worktiesInstancesIds) {
                            if (worktiesInstancesIds.length !== 3) {
                                return false;
                            }
                            return _.indexOf(worktiesInstancesIds, worktyInstanceId) === 0;
                        });
                        // Delete workty instance
                        adminClient.del(headerLocation, function (err, req, res, data) {
                            expect(err).to.be.null;
                            expect(data).is.empty;
                            expect(res.statusCode).to.equals(204);
                            done();
                        });
                    });
                });
            });

            it('should get a 500 response with code 10 for position index is -1', function (done) {
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_index=-1', {
                    desc: 'testworkty',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(500);
                    expect(data).to.have.keys('error');
                    expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                    expect(data.error.code).to.equals(10);
                    expect(data.error.error_link).to.not.be.empty;
                    expect(data.error.message).to.not.be.empty;
                    done();
                });
            });

            it('should get a 500 response with code 11 for missing position id', function (done) {
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_id=N', {
                    desc: 'testworkty',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(500);
                    expect(data).to.have.keys('error');
                    expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                    expect(data.error.code).to.equals(11);
                    expect(data.error.error_link).to.not.be.empty;
                    expect(data.error.message).to.not.be.empty;
                    done();
                });
            });

            it('should get a 201 response for position id', function (done) {
                // Insert workty by index 0
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_index=0', {
                    desc: 'testworkty',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(201);
                    expect(res.headers).to.contain.keys('location');
                    expect(data).to.not.be.null;
                    var worktyInstanceId = data._id;
                    expect(res.headers.location).to.have.string('worktiesInstances/' + worktyInstanceId);
                    expect(data.desc).to.be.equal('testworkty');
                    var headerLocationFirst = res.headers.location;
                    // Get workflow to check workty instance added by index 1
                    adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(res.statusCode).to.equals(200);
                        expect(data).to.not.be.empty;
                        expect(data.worktiesInstancesIds).to.satisfy(function (worktiesInstancesIds) {
                            if (worktiesInstancesIds.length !== 3) {
                                return false;
                            }
                            return _.indexOf(worktiesInstancesIds, worktyInstanceId) === 0;
                        });
                        // Insert workty instance before worktyInstanceId
                        adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_id=' + worktyInstanceId, {
                            desc: 'testworkty',
                            worktyId: Workties[0]._id
                        }, function (err, req, res, data) {
                            expect(err).to.be.null;
                            expect(res.statusCode).to.equals(201);
                            expect(res.headers).to.contain.keys('location');
                            expect(data).to.not.be.null;
                            worktyInstanceId = data._id;
                            expect(res.headers.location).to.have.string('worktiesInstances/' + worktyInstanceId);
                            expect(data.desc).to.be.equal('testworkty');
                            var headerLocation = res.headers.location;
                            // Get workflow to check workty instance added by index 1
                            adminClient.get(ApiPrefix + '/workflows/' + Workflows[0]._id, function (err, req, res, data) {
                                expect(err).to.be.null;
                                expect(res.statusCode).to.equals(200);
                                expect(data).to.not.be.empty;
                                expect(data.worktiesInstancesIds).to.satisfy(function (worktiesInstancesIds) {
                                    if (worktiesInstancesIds.length !== 4) {
                                        return false;
                                    }
                                    return _.indexOf(worktiesInstancesIds, worktyInstanceId) === 0;
                                });
                                // Delete first workty instance
                                adminClient.del(headerLocationFirst, function (err, req, res, data) {
                                    expect(err).to.be.null;
                                    expect(data).is.empty;
                                    expect(res.statusCode).to.equals(204);
                                    // Delete second workty instance
                                    adminClient.del(headerLocation, function (err, req, res, data) {
                                        expect(err).to.be.null;
                                        expect(data).is.empty;
                                        expect(res.statusCode).to.equals(204);
                                        done();
                                    });
                                });
                            });
                        });
                    });
                });
            });

            it('should get a 500 response with code 1 for missing worktyId', function (done) {
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances?position_index=-1', {desc: 'testworkty'}, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(409);
                    expect(data).to.have.keys('error');
                    expect(data.error).to.have.keys(['code', 'error_link', 'message', 'errors', 'inputParameters']);
                    expect(data.error.code).is.empty;
                    expect(data.error.error_link).to.not.be.empty;
                    expect(data.error.message).to.not.be.empty;
                    done();
                });
            });
        });

        describe('.updateWorktyInstance()', function () {
            it('should get a 400 response', function (done) {
                adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(400);
                    var error = JSON.parse(err.message).error;
                    expect(error.errors).is.empty;
                    done();
                });
            });

            it('should get a 200 response', function (done) {
                adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id, {desc: 'updateddesc'}, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.null;
                    expect(data.desc).to.be.equal('updateddesc');
                    done();
                });
            });
        });

        describe('.delWorktyInstance()', function () {
            it('should get a 500 response not found', function (done) {
                // Delete workty instance
                adminClient.del(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id + 'N', function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(500);
                    done();
                });
            });

            it('should get a 204 response', function (done) {
                // Create workty instance
                adminClient.post(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances', {
                    desc: 'testworkty',
                    worktyId: Workties[0]._id
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(201);
                    expect(res.headers).to.contain.keys('location');
                    expect(data).to.not.be.null;
                    var workflowId = data.workflowId;
                    var worktyInstanceId = data._id;
                    expect(res.headers.location).to.have.string('/' + workflowId);
                    // Delete workty instance
                    adminClient.del(ApiPrefix + '/workflows/' + workflowId + '/worktiesInstances/' + worktyInstanceId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        describe('.updateWorktyInstanceProperty()', function () {
            it('should get a 400 response', function (done) {
                adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id + '/properties/' + WorktiesInstances[0].propertiesIds[0]._id, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(400);
                    var error = JSON.parse(err.message).error;
                    expect(error.errors).is.empty;
                    done();
                });
            });

            it('should get a 200 response', function (done) {
                adminClient.put(ApiPrefix + '/workflows/' + Workflows[0]._id + '/worktiesInstances/' + WorktiesInstances[0]._id + '/properties/' + WorktiesInstances[0].propertiesIds[0]._id, {
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