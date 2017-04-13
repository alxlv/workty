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
var util = require('util');
var WorktyRepositoryCodePath = RootFolder + '/workties-repository';
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

describe('Payment permissions for Rest API', function () {
    var Clients = [];
    var Accounts = [];
    var SuperuserWorkties = [];
    var RegularuserWorkties = [];
    var RegularuserPayments = [];
    var AccountsPerPage = 1;
    var WORKTIES_COUNT = 2;
    var WORKTIES_FILENAMES = ['unsorted/nodejs/unit-tests/without-delay.zip'];

    console.log('Run Payment permissions for Rest API tests for version ' + ApiPrefix + '/' + SubVersion);

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

    function _deleteAccount(params) {
        return new Promise(function (resolve, reject) {
            try {
                adminClient.del(ApiPrefix + '/accounts/' + Accounts[params.idx]._id + '?removing=true', function (err, req, res, data) {
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

            return Promise.all(_createPromises(_createWorkty, {count: WORKTIES_COUNT}));
        }).then(function (results) { // Create admin workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                SuperuserWorkties.push(data);
            }

            return Promise.all(_createPromises(_createPayment, {
                count: WORKTIES_COUNT,
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
                count: WORKTIES_COUNT,
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
                count: RegularuserWorkties.length,
                workties: RegularuserWorkties,
                client: adminClient
            }));
        }).then(function (results) { // Delete regular user workties
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            return Promise.all(_createPromises(_deletePayment, {
                count: RegularuserPayments.length,
                payments: RegularuserPayments,
                client: adminClient
            }));
        }).then(function (results) { // Delete regular user payments
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                expect(res.statusCode).to.equals(204);
            }

            return Promise.all(_createPromises(_deleteAccount, {count: AccountsPerPage}));
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
            client.get(ApiPrefix + '/payments', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(WORKTIES_COUNT);
                done();
            });
        });
    });

    describe('.getById()', function () {
        it('should get a 200 response', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/payments/' + RegularuserPayments[0]._id, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get records-count', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/payments/' + RegularuserPayments[0]._id + '?count=true', function (err, req, res, data) {
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
        it('should get 200 response', function (done) {
            var client = Clients[0];
            client.post(ApiPrefix + '/payments', {worktyId: SuperuserWorkties[0]._id}, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                RegularuserPayments.push(data);
                RegularuserWorkties.push({_id: data.worktyId});
                done();
            });
        });
    });

    describe('.update()', function () {
        it('should get a 500 response with operation forbidden error', function (done) {
            var client = Clients[0];
            client.put(ApiPrefix + '/payments/' + RegularuserPayments[0]._id, {msg: 'new payment'}, function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });
    });

    describe('.del()', function () {
        it('should get a 204 response', function (done) {
            var client = Clients[0];
            // Create new payment
            client.post(ApiPrefix + '/payments', {worktyId: SuperuserWorkties[0]._id}, function (err, req, res, data) {
                expect(err).to.benull;
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