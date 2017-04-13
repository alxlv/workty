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

describe('Workty permissions for Rest API', function () {
    var Accounts = [];
    var Clients = [];
    var AccountsPerPage = 1;
    var WorktiesPerPage = 1;
    var SuperuserWorkties = [];

    console.log('Run Workty permissions for Rest API tests for version ' + ApiPrefix + '/' + SubVersion);

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
                    password: 'commonuser' + params.idx,
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

    // Delete workties
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
                        'Authorization': 'Basic ' + new Buffer(data.email + ':' + 'commonuser' + idx).toString('base64')
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

    describe('.getAllWorkties()', function () {
        it('should get 0', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/workties?page_num=1&per_page=2', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(0);
                done();
            });
        });
    });

    describe('.getWorktyById()', function () {
        it('should get 0', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/workties/' + SuperuserWorkties[0]._id, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.be.empty;
                done();
            });
        });
    });

    describe('.addWorkty()', function () {
        it('should get 500 response with operation forbidden error', function (done) {
            var client = Clients[0];
            client.post(ApiPrefix + '/workties', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });
    });

    describe('.updateWorkty()', function () {
        it('should get a 500 response with operation forbidden error', function (done) {
            var client = Clients[0];
            client.put(ApiPrefix + '/workties/' + SuperuserWorkties[0]._id, {
                name: 'mytestworkty',
                desc: 'testworkty'
            }, function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });
    });

    describe('.delWorkty()', function () {
        it('should get a 500 response with operation forbidden error', function (done) {
            var client = Clients[0];
            client.del(ApiPrefix + '/workties/' + SuperuserWorkties[0]._id, function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });
    });

    describe('.addProperty()', function () {
        it('should get a 500 response with operation forbidden error', function (done) {
            var client = Clients[0];
            client.post(ApiPrefix + '/workties/' + SuperuserWorkties[0]._id + '/properties', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });
    });

    describe('.updateProperty()', function () {
        it('should get a 500 response with operation forbidden error', function (done) {
            // Create workty property
            var client = Clients[0];
            client.post(ApiPrefix + '/workties/' + SuperuserWorkties[0]._id + '/properties', {
                property: {
                    name: 'mytestworktyproperty',
                    value: 'testworktyproperty'
                }
            }, function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });
    });

    describe('.delProperty()', function () {
        it('should get a 500 response with operation forbidden error', function (done) {
            // Create workty property
            var client = Clients[0];
            client.post(ApiPrefix + '/workties/' + SuperuserWorkties[0]._id + '/properties', {
                property: {
                    name: 'mytestworktyproperty',
                    value: 'testworktyproperty'
                }
            }, function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                done();
            });
        });
    });
});