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
      'Authorization':  config.supervisor.getAuthorizationBasic()  // supervisor
    },
    rejectUnauthorized: false
});

describe('Workty Rest API', function () {
    var WorktiesPerPage = 3;
    var WorktiesIds = [];
    var WORKTIES_FILENAMES = ['unsorted/nodejs/unit-tests/without-delay.zip'];

    console.log('Run Workty API tests for version ' + ApiPrefix + '/' + SubVersion);

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
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    function _deleteWorkty(idx) {
        return new Promise(function (resolve, reject) {
            try {
                adminClient.del(ApiPrefix + '/workties/' + WorktiesIds[idx], function (err, req, res, data) {
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

        Promise.all(_createPromises(_createWorkty, WorktiesPerPage)).then(function (results) { // Create workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                WorktiesIds.push(data._id);
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
        }).done(function (err) {
            expect(err).to.be.undefined;
            done();
        });
    });

    describe('.getAllWorkties()', function () {
        it('should get a 200 response', function (done) {
            adminClient.get(ApiPrefix + '/workties', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                done();
            });
        });

        it('should get 2 and page 1', function (done) {
            adminClient.get(ApiPrefix + '/workties?page_num=1&per_page=2', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(2);
                done();
            });
        });

        it('should get 3', function (done) {
            adminClient.get(ApiPrefix + '/workties?per_page=3', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                done();
            });
        });

        it('should get records-count', function (done) {
            adminClient.get(ApiPrefix + '/workties?per_page=3&count=true', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('3');
                done();
            });
        });

        it('should get sorted', function (done) {
            adminClient.get(ApiPrefix + '/workties?per_page=3&sort=_id', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                expect(data).to.satisfy(function (workties) {
                    var currentValue = null;
                    _.each(workties, function (workty) {
                        if (!currentValue) {
                            currentValue = workty._id;
                        } else {
                            if (workty._id <= currentValue) expect(true).to.be.false();
                            currentValue = workty._id;
                        }
                    });
                    return true;
                });
                done();
            });
        });

        it('should get fields', function (done) {
            adminClient.get(ApiPrefix + '/workties?per_page=3&fields=_id,name,desc', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                expect(data).to.satisfy(function (workties) {
                    _.each(workties, function (workty) {
                        expect(workty).to.have.keys(['_id', 'name', 'desc']);
                    });
                    return true;
                });
                done();
            });
        });
    });

    describe('.getWorktyById()', function () {
        it('should get a 200 response', function (done) {
            adminClient.get(ApiPrefix + '/workties/' + WorktiesIds[0], function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get a 500 response not found', function (done) {
            adminClient.get(ApiPrefix + '/workties/' + WorktiesIds[0] + 'N', function (err, req, res, data) {
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
            adminClient.get(ApiPrefix + '/workties/' + WorktiesIds[0] + '?count=true', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('1');
                done();
            });
        });

        it('should get fields', function (done) {
            adminClient.get(ApiPrefix + '/workties/' + WorktiesIds[0] + '?fields=_id,name,desc', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys(['_id', 'name', 'desc']);
                done();
            });
        });
    });

    describe('.addWorkty()', function () {
        it('should get a 409 response', function (done) {
            adminClient.post(ApiPrefix + '/workties', function (err, req, res, data) {
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
            // Create workty
            adminClient.post(ApiPrefix + '/workties', {
                name: 'mytestworkty_0',
                desc: 'testworkty_0'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyId = data._id;
                expect(res.headers.location).to.have.string('workties/' + worktyId);
                expect(data.name).to.be.equal('mytestworkty_0');
                expect(data.desc).to.be.equal('testworkty_0');
                // Delete workty
                adminClient.del(res.headers.location, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(data).is.empty;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });

    describe('.updateWorkty()', function () {
        it('should get a 400 response', function (done) {
            // Create workty
            adminClient.post(ApiPrefix + '/workties', {
                name: 'mytestworkty_1',
                desc: 'testworkty_1'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyId = data._id;
                expect(res.headers.location).to.have.string('workties/' + worktyId);
                expect(data.name).to.be.equal('mytestworkty_1');
                expect(data.desc).to.be.equal('testworkty_1');
                // Update workty
                adminClient.put(res.headers.location, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(400);
                    var error = JSON.parse(err.message).error;
                    expect(error.errors).is.empty;
                    // Delete workty
                    adminClient.del(ApiPrefix + '/workties/' + worktyId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 409 response', function (done) {
            // Create workty
            adminClient.post(ApiPrefix + '/workties', {
                name: 'mytestworkty_2',
                desc: 'testworkty_2'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyId = data._id;
                expect(res.headers.location).to.have.string('workties/' + worktyId);
                // Update workty
                adminClient.put(res.headers.location, {name: ''}, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(409);
                    var error = JSON.parse(err.message).error;
                    expect(error.errors).to.have.length(1);
                    expect(error.errors[0].message).to.equals("Path `name` is required.");
                    // Delete workty
                    adminClient.del(ApiPrefix + '/workties/' + worktyId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 200 response', function (done) {
            // Create workty
            adminClient.post(ApiPrefix + '/workties', {
                name: 'mytestworkty_3',
                desc: 'testworkty_3'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyId = data._id;
                expect(res.headers.location).to.have.string('workties/' + worktyId);
                // Update workty
                adminClient.put(res.headers.location, {
                    name: 'mytestworkty_4',
                    desc: 'testworkty_4'
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.null;
                    var updatedWorktyId = data._id;
                    expect(updatedWorktyId).to.equals(worktyId);
                    // Delete workty
                    adminClient.del(ApiPrefix + '/workties/' + worktyId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });
    });

    describe('.delWorkty()', function () {
        it('should get a 500 response not found', function (done) {
            // Create workty
            adminClient.post(ApiPrefix + '/workties', {
                name: 'mytestworkty0',
                desc: 'testworkty0'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyId = data._id;
                expect(res.headers.location).to.have.string('workties/' + worktyId);
                // Delete workty
                adminClient.del(ApiPrefix + '/workties/' + worktyId + 'N', function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(500);
                    adminClient.del(ApiPrefix + '/workties/' + worktyId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 204 response', function (done) {
            // Create workty
            adminClient.post(ApiPrefix + '/workties', {
                name: 'mytestworkty1',
                desc: 'testworkty1'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyId = data._id;
                expect(res.headers.location).to.have.string('workties/' + worktyId);
                // Delete workty
                adminClient.del(ApiPrefix + '/workties/' + worktyId, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(data).is.empty;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });

    describe('.addProperty()', function () {
        it('should get a 409 response', function (done) {
            adminClient.post(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties', function (err, req, res, data) {
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
            // Create workty property
            adminClient.post(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties', {
                property: {
                    name: 'mytestworktyproperty',
                    value: 'testworktyproperty'
                }
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyPropertyId = data._id;
                expect(res.headers.location).to.have.string('properties/' + worktyPropertyId);
                expect(data.name).to.be.equal('mytestworktyproperty');
                expect(data.value).to.be.equal('testworktyproperty');
                // Delete workty property
                adminClient.del(res.headers.location, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(data).is.empty;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });

    describe('.updateProperty()', function () {
        it('should get a 400 response', function (done) {
            // Create workty property
            adminClient.post(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties', {
                property: {
                    name: 'mytestworktyproperty0',
                    value: 'testworktyproperty0'
                }
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyPropertyId = data._id;
                expect(res.headers.location).to.have.string('properties/' + worktyPropertyId);
                expect(data.name).to.be.equal('mytestworktyproperty0');
                expect(data.value).to.be.equal('testworktyproperty0');
                // Update workty property
                adminClient.put(res.headers.location, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(400);
                    var error = JSON.parse(err.message).error;
                    expect(error.errors).is.empty;
                    // Delete workty property
                    adminClient.del(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties/' + worktyPropertyId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 409 response', function (done) {
            // Create workty
            adminClient.post(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties', {
                property: {
                    name: 'mytestworktyproperty1',
                    value: 'testworktyproperty1'
                }
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyPropertyId = data._id;
                expect(res.headers.location).to.have.string('properties/' + worktyPropertyId);
                // Update workty property
                adminClient.put(res.headers.location, {property: {name: ''}}, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(409);
                    var error = JSON.parse(err.message).error;
                    expect(error.errors).to.have.length(1);
                    expect(error.errors[0].message).to.equals("Path `name` is required.");
                    // Delete workty property
                    adminClient.del(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties/' + worktyPropertyId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 200 response', function (done) {
            // Create workty property
            adminClient.post(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties', {
                property: {
                    name: 'mytestworktyproperty2',
                    value: 'testworktyproperty2'
                }
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyPropertyId = data._id;
                expect(res.headers.location).to.have.string('properties/' + worktyPropertyId);
                // Update workty property
                adminClient.put(res.headers.location, {
                    property: {
                        name: 'mytestworktyproperty2_2',
                        value: 'testworktyproperty2_2'
                    }
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.null;
                    var updatedWorktyPropertyId = data._id;
                    expect(updatedWorktyPropertyId).to.equals(worktyPropertyId);
                    expect(data.name).to.be.equal('mytestworktyproperty2_2');
                    expect(data.value).to.be.equal('testworktyproperty2_2');
                    // Delete workty property
                    adminClient.del(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties/' + updatedWorktyPropertyId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });
    });

    describe('.delProperty()', function () {
        it('should get a 500 response not found', function (done) {
            // Create workty property
            adminClient.post(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties', {
                property: {
                    name: 'mytestworktyproperty3',
                    value: 'testworktyproperty3'
                }
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyPropertyId = data._id;
                expect(res.headers.location).to.have.string('properties/' + worktyPropertyId);
                // Delete workty property
                adminClient.del(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties/' + worktyPropertyId + 'N', function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(500);
                    adminClient.del(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties/' + worktyPropertyId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 204 response', function (done) {
            // Create workty property
            adminClient.post(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties', {
                property: {
                    name: 'mytestworktyproperty4',
                    value: 'testworktyproperty4'
                }
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var worktyPropertyId = data._id;
                expect(res.headers.location).to.have.string('properties/' + worktyPropertyId);
                // Delete workty property
                adminClient.del(ApiPrefix + '/workties/' + WorktiesIds[0] + '/properties/' + worktyPropertyId, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(data).is.empty;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });
});