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
var fs = require('fs');
var _ = require('lodash');
var expect = require('chai').expect;
var ApiPrefix = '/api/v1';
var Promise = require('promise');
var WorktyRepositoryCodePath = RootFolder + '/workties-repository';
var config = rootRequire('config');
var util = require('util');
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

describe('Payment Rest API', function () {
    var SuperuserWorkties = [];
    var SuperuserPayments = [];
    var SuperuserWorktiesForPayments = [];
    var WORKTIES_COUNT = 2;
    var WORKTIES_FILENAMES = ['unsorted/nodejs/unit-tests/without-delay.zip'];

    console.log('Run Payment Rest API tests for version ' + ApiPrefix + '/' + SubVersion);

    function _createPromises(callback, params) {
        var promises = [];

        for (var idx = 0; idx < params.count; idx++) {
            params.idx = idx;
            promises.push(callback(params));
        }

        return promises;
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

    function _createPayment(params) {
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

    function _deleteWorkty(params) {
        return new Promise(function (resolve, reject) {
            try {
                var id = params.workties[params.idx]._id || params.workties[params.idx];
                params.client.del(ApiPrefix + '/workties/' + id, function (err, req, res, data) {
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
        this.timeout(8000);

        Promise.all(_createPromises(_createWorkty, {count: WORKTIES_COUNT})).then(function (results) { // Create admin workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                SuperuserWorkties.push(data);
            }

            return Promise.all(_createPromises(_createPayment, {
                count: WORKTIES_COUNT,
                client: adminClient,
                workties: SuperuserWorkties
            }));
        }).then(function (results) { // Create admin user workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                SuperuserWorktiesForPayments.push({_id: data.worktyId});
                SuperuserPayments.push(data);
            }
        }).done(function (err) {
            expect(err).to.be.undefined;
            done();
        });
    });

    // Run once after the last test case
    after(function (done) {
        Promise.all(_createPromises(_deleteWorkty, {
            count: WORKTIES_COUNT,
            workties: SuperuserWorkties,
            client: adminClient
        })).then(function (results) {
            for (var idx = 0; idx < results.length; idx++) { // Delete admin workties
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            return Promise.all(_createPromises(_deleteWorkty, {
                count: WORKTIES_COUNT,
                client: adminClient,
                workties: SuperuserWorktiesForPayments
            }));
        }).then(function (results) { // Delete admin user workties created for payments
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            return Promise.all(_createPromises(_deletePayment, {
                count: WORKTIES_COUNT,
                client: adminClient,
                payments: SuperuserPayments
            }));
        }).then(function (results) { // Delete admin user payments
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
            adminClient.get(ApiPrefix + '/payments', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(WORKTIES_COUNT);
                done();
            });
        });

        it('should get sorted', function (done) {
            adminClient.get(ApiPrefix + '/payments?per_page=2&sort=_id', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(2);
                expect(data).to.satisfy(function (payments) {
                    var currentValue = null;
                    _.each(payments, function (payment) {
                        if (!currentValue) {
                            currentValue = payment._id;
                        } else {
                            if (payment._id <= currentValue) expect(true).to.be.false();
                            currentValue = payment._id;
                        }
                    });
                    return true;
                });
                done();
            });
        });

        it('should get fields', function (done) {
            adminClient.get(ApiPrefix + '/payments?per_page=2&fields=_id,msg,created', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(2);
                expect(data).to.satisfy(function (payments) {
                    _.each(payments, function (payment) {
                        expect(payment).to.have.keys(['_id', 'msg', 'created']);
                    });
                    return true;
                });
                done();
            });
        });
    });

    describe('.getById()', function () {
        it('should get a 200 response', function (done) {
            adminClient.get(ApiPrefix + '/payments/' + SuperuserPayments[0]._id, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get a 500 response not found', function (done) {
            adminClient.get(ApiPrefix + '/payments/' + SuperuserPayments[0]._id + 'N', function (err, req, res, data) {
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
            adminClient.get(ApiPrefix + '/payments/' + SuperuserPayments[0]._id + '?count=true', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('1');
                done();
            });
        });

        it('should get fields', function (done) {
            adminClient.get(ApiPrefix + '/payments/' + SuperuserPayments[0]._id + '?fields=_id,worktyId,msg,created', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys(['_id', 'worktyId', 'msg', 'created']);
                done();
            });
        });
    });

    describe('.add()', function () {
        it('should get a 409 response', function (done) {
            adminClient.post(ApiPrefix + '/payments', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(409);
                var error = JSON.parse(err.message).error;
                expect(error.message).to.equals('Validation Error');
                expect(error.errors).to.have.length(1);
                expect(error.errors[0].message).to.equals('Path `worktyId` is required.');
                done();
            });
        });

        it('should get 201 response', function (done) {
            // Add payment
            adminClient.post(ApiPrefix + '/payments', {worktyId: SuperuserWorkties[0]._id}, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var paymentTransactionId = data._id;
                expect(res.headers.location).to.have.string('/' + paymentTransactionId);
                // Delete workty
                adminClient.del(ApiPrefix + '/workties/' + data.worktyId, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(204);
                    // Delete payment
                    adminClient.del(ApiPrefix + '/payments/' + paymentTransactionId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });
    });

    describe('.update()', function () {
        it('should get a 400 response', function (done) {
            adminClient.put(ApiPrefix + '/payments/' + SuperuserPayments[0]._id, function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(400);
                var error = JSON.parse(err.message).error;
                expect(error.errors).is.empty;
                done();
            });
        });

        it('should get a 200 response', function (done) {
            adminClient.put(ApiPrefix + '/payments/' + SuperuserPayments[0]._id, {msg: 'new payment'}, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                done();
            });
        });
    });

    describe('.del()', function () {
        it('should get a 500 response not found', function (done) {
            // Delete payment
            adminClient.del(ApiPrefix + '/payments/' + SuperuserPayments[0]._id + 'N', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });

        it('should get a 204 response', function (done) {
            // Create new payment
            adminClient.post(ApiPrefix + '/payments', {worktyId: SuperuserWorkties[0]._id}, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var paymentTransactionId = data._id;
                expect(res.headers.location).to.have.string('/' + paymentTransactionId);
                // Delete workty
                adminClient.del(ApiPrefix + '/workties/' + data.worktyId, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(204);
                    // Delete payment
                    adminClient.del(ApiPrefix + '/payments/' + paymentTransactionId, function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });
    });
});