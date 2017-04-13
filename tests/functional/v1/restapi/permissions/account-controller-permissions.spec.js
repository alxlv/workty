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
var Promise = require('promise');
var ApiPrefix = '/api/v1';
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

describe('Account permissions for Rest API', function () {
    var AccountsPerPage = 1;
    var Accounts = [];
    var Clients = [];

    console.log('Run Account permissions for Rest API tests for version v' + ApiPrefix + '/' + SubVersion);

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
                adminClient.post('v' + ApiMajorVersion + '/accounts', {
                    name: 'myaccount' + idx,
                    email: 'myaccount' + idx + '@workty.com',
                    password: 'commonuser' + idx
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
                adminClient.del('v' + ApiMajorVersion + '/accounts/' + Accounts[idx]._id + '?removing=true', function (err, req, res, data) {
                    resolve({res: res});
                });
            } catch (ex) {
                reject(ex);
            }
        });
    }

    // Run once before the first test case
    before(function (done) {
        Promise.all(_createPromises(_createAccount, AccountsPerPage)).then(function (results) { // Create accounts
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
        }).done(function (err) {
            expect(err).to.be.undefined;
            done();
        });
    });

    // Run once after the last test case
    after(function (done) {
        Promise.all(_createPromises(_deleteAccount, AccountsPerPage)).then(function (results) { // Delete accounts
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                // Already was deleted by user
                expect(res.statusCode).to.equals(500);
            }
        }).done(function (err) {
            expect(err).to.be.undefined;
            done();
        });
    });

    describe('.getAllAccounts()', function () {
        it('should get a 200 response', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts', function (err, req, res, data) {
                expect(err).to.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(1); // only own account
                done();
            });
        });

        it('should get 1', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts?per_page=3', function (err, req, res, data) {
                expect(err).to.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(1);
                done();
            });
        });

        it('should get records-count', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts?per_page=3&count=true', function (err, req, res, data) {
                expect(err).to.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(1);
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('1');
                done();
            });
        });

        it('should get sorted', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts?per_page=3&sort=_id', function (err, req, res, data) {
                expect(err).to.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(1);
                expect(data).to.satisfy(function (accounts) {
                    var currentValue = null;
                    _.each(accounts, function (account) {
                        if (!currentValue) {
                            currentValue = account._id;
                        } else {
                            if (account._id <= currentValue) {
                                expect(true).to.be.false();
                            }
                            currentValue = account._id;
                        }
                    });
                    return true;
                });
                done();
            });
        });

        it('should get fields', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts?per_page=3&fields=_id,name,email', function (err, req, res, data) {
                expect(err).to.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(1);
                expect(data).to.satisfy(function (accounts) {
                    _.each(accounts, function (account) {
                        expect(account).to.have.keys(['_id', 'name', 'email']);
                    });
                    return true;
                });
                done();
            });
        });
    });

    describe('.getAccountById()', function () {
        it('should get a 200 response', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts/' + Accounts[0]._id, function (err, req, res, data) {
                expect(err).to.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get a 200', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts/' + Accounts[0]._id + 'N', function (err, req, res, data) {
                expect(err).to.not.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get records-count', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts/' + Accounts[0]._id + '?count=true', function (err, req, res, data) {
                expect(err).to.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('1');
                done();
            });
        });

        it('should get fields', function (done) {
            var client = Clients[0];
            client.get(ApiPrefix + '/accounts/' + Accounts[0]._id + '?fields=_id,name,email', function (err, req, res, data) {
                expect(err).to.benull;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys(['_id', 'name', 'email']);
                expect(data._id).to.equals(Accounts[0]._id);
                expect(data.name).to.equals(Accounts[0].name);
                expect(data.email).to.equals(Accounts[0].email);
                done();
            });
        });
    });

    describe('.addAccount()', function () {
        var client = Clients[0];
        it('should get a 500 response with operation forbidden error for empty request', function (done) {
            var client = Clients[0];
            client.post(ApiPrefix + '/accounts', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(500);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys('error');
                expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                expect(data.error.code).to.equals(13);
                expect(data.error.error_link).to.not.be.empty;
                expect(data.error.message).to.not.be.empty;
                done();
            });
        });

        it('should get a 500 response with operation forbidden error', function (done) {
            var client = Clients[0];
            // Create account
            client.post(ApiPrefix + '/accounts', {
                name: 'mytestaccount',
                email: 'testaccount@workty.com'
            }, function (err, req, res, data) {
                expect(err).to.not.benull;
                expect(res.statusCode).to.equals(500);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys('error');
                expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                expect(data.error.code).to.equals(13);
                expect(data.error.error_link).to.not.be.empty;
                expect(data.error.message).to.not.be.empty;
                done();
            });
        });
    });

    describe('.updateAccount()', function () {
        it('should get a 500 response with operation forbidden error', function (done) {
            var client = Clients[0];
            // Create account
            client.post(ApiPrefix + '/accounts', {
                name: 'mytestaccount2',
                email: 'testaccount2@workty.com'
            }, function (err, req, res, data) {
                expect(err).to.not.benull;
                expect(res.statusCode).to.equals(500);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys('error');
                expect(data.error).to.have.keys(['code', 'error_link', 'message', 'inputParameters']);
                expect(data.error.code).to.equals(13);
                expect(data.error.error_link).to.not.be.empty;
                expect(data.error.message).to.not.be.empty;
                done();
            });
        });
    });

    describe('.delAccount()', function () {
        it('should get a 204 response', function (done) {
            var client = Clients[0];
            // Create account
            client.del(ApiPrefix + '/accounts/' + Accounts[0]._id + '?removing=true', function (err, req, res, data) {
                expect(err).to.not.benull;
                expect(res.statusCode).to.equals(204);
                expect(data).to.be.empty;
                done();
            });
        });
    });
});