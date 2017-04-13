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

describe('Account Rest API', function () {
    var AccountsPerPage = 3;
    var AccountsIds = [];

    console.log('Run Account API tests for version ' + ApiPrefix + '/' + SubVersion);

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
                adminClient.post(ApiPrefix + '/accounts', {
                    name: 'myaccount' + idx,
                    email: 'myaccount' + idx + '@workty.com'
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
                adminClient.del(ApiPrefix + '/accounts/' + AccountsIds[idx] + '?removing=true', function (err, req, res, data) {
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

        Promise.all(_createPromises(_createAccount, AccountsPerPage)).then(function (results) { // Create accounts
            for (var idx = 0; idx < results.length; idx++) {
                var res = results[idx].res;
                var data = results[idx].data;
                expect(res.statusCode).to.equals(201);
                expect(data).to.not.be.empty;
                AccountsIds.push(data._id);
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
                expect(res.statusCode).to.equals(204);
            }
        }).done(function (err) {
            expect(err).to.be.undefined;
            done();
        });
    });

    describe('.getAllAccounts()', function () {
        it('should get a 200 response', function (done) {
            adminClient.get(ApiPrefix + '/accounts', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(4); // 3 + supervisor accounts
                done();
            });
        });

        it('should get 2 and page 1', function (done) {
            adminClient.get(ApiPrefix + '/accounts?page_num=1&per_page=2', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(2);
                done();
            });
        });

        it('should get 3', function (done) {
            adminClient.get(ApiPrefix + '/accounts?per_page=3', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                done();
            });
        });

        it('should get records-count', function (done) {
            adminClient.get(ApiPrefix + '/accounts?per_page=3&count=true', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('3');
                done();
            });
        });

        it('should get sorted', function (done) {
            adminClient.get(ApiPrefix + '/accounts?per_page=3&sort=_id', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
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
            adminClient.get(ApiPrefix + '/accounts?per_page=3&fields=_id,name,email', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.have.length(3);
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
            adminClient.get(ApiPrefix + '/accounts/' + AccountsIds[0], function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                done();
            });
        });

        it('should get a 500 response not found', function (done) {
            adminClient.get(ApiPrefix + '/accounts/' + AccountsIds[0] + 'N', function (err, req, res, data) {
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
            adminClient.get(ApiPrefix + '/accounts/' + AccountsIds[0] + '?count=true', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(res.headers).to.contain.keys('records-count');
                expect(res.headers['records-count']).equals('1');
                done();
            });
        });

        it('should get fields', function (done) {
            adminClient.get(ApiPrefix + '/accounts/' + AccountsIds[0] + '?fields=_id,name,email', function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(200);
                expect(data).to.not.be.empty;
                expect(data).to.have.keys(['_id', 'name', 'email']);
                done();
            });
        });
    });

    describe('.addAccount()', function () {
        it('should get a 409 response', function (done) {
            adminClient.post(ApiPrefix + '/accounts', function (err, req, res, data) {
                expect(err).to.not.be.null;
                expect(res.statusCode).to.equals(409);
                var error = JSON.parse(err.message).error;
                expect(error.message).to.equals('Validation Error');
                expect(error.errors).to.have.length(1);
                expect(error.errors[0].message).to.equals('Path `email` is required.');
                done();
            });
        });

        it('should get a 201 response', function (done) {
            // Create account
            adminClient.post(ApiPrefix + '/accounts', {
                name: 'mytestaccount',
                email: 'testaccount@workty.com'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var accountId = data._id;
                expect(res.headers.location).to.have.string('accounts/' + accountId);
                expect(data.name).to.be.equal('mytestaccount');
                expect(data.email).to.be.equal('testaccount@workty.com');
                // Delete account
                adminClient.del(res.headers.location + '?removing=true', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(data).is.empty;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });

    describe('.updateAccount()', function () {
        it('should get a 400 response', function (done) {
            // Create account
            adminClient.post(ApiPrefix + '/accounts', {
                name: 'mytestaccount2',
                email: 'testaccount2@workty.com'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var accountId = data._id;
                expect(res.headers.location).to.have.string('accounts/' + accountId);
                expect(data.name).to.be.equal('mytestaccount2');
                expect(data.email).to.be.equal('testaccount2@workty.com');
                // Update account
                adminClient.put(res.headers.location, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(400);
                    var error = JSON.parse(err.message).error;
                    expect(error.errors).is.empty;
                    // Delete account
                    adminClient.del(ApiPrefix + '/accounts/' + accountId + '?removing=true', function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 409 response', function (done) {
            // Create account
            adminClient.post(ApiPrefix + '/accounts', {
                name: 'mytestaccount3',
                email: 'testaccount3@workty.com'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var accountId = data._id;
                expect(res.headers.location).to.have.string('accounts/' + accountId);
                // Update account
                adminClient.put(res.headers.location, {email: ''}, function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(409);
                    var error = JSON.parse(err.message).error;
                    expect(error.errors).to.have.length(1);
                    expect(error.errors[0].message).to.equals('Path `email` is required.');
                    // Delete account
                    adminClient.del(ApiPrefix + '/accounts/' + accountId + '?removing=true', function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 200 response', function (done) {
            // Create account
            adminClient.post(ApiPrefix + '/accounts', {
                name: 'mytestaccount4',
                email: 'testaccount4@workty.com'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var accountId = data._id;
                expect(res.headers.location).to.have.string('accounts/' + accountId);
                // Update workty
                adminClient.put(res.headers.location, {
                    name: 'mytestworkty2',
                    desc: 'testworkty2'
                }, function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(res.statusCode).to.equals(200);
                    expect(data).to.not.be.null;
                    var updatedAccountId = data._id;
                    expect(updatedAccountId).to.equals(accountId);
                    // Delete account
                    adminClient.del(ApiPrefix + '/accounts/' + accountId + '?removing=true', function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });
    });

    describe('.delAccount()', function () {
        it('should get a 500 response not found', function (done) {
            // Create account
            adminClient.post(ApiPrefix + '/accounts', {
                name: 'mytestaccount5',
                email: 'testaccount5@workty.com'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var accountId = data._id;
                expect(res.headers.location).to.have.string('accounts/' + accountId);
                // Delete account
                adminClient.del(ApiPrefix + '/accounts/' + accountId + 'N', function (err, req, res, data) {
                    expect(err).to.not.be.null;
                    expect(res.statusCode).to.equals(500);
                    adminClient.del(ApiPrefix + '/accounts/' + accountId + '?removing=true', function (err, req, res, data) {
                        expect(err).to.be.null;
                        expect(data).is.empty;
                        expect(res.statusCode).to.equals(204);
                        done();
                    });
                });
            });
        });

        it('should get a 204 response', function (done) {
            // Create account
            adminClient.post(ApiPrefix + '/accounts', {
                name: 'mytestaccount6',
                email: 'testaccount6@workty.com'
            }, function (err, req, res, data) {
                expect(err).to.be.null;
                expect(res.statusCode).to.equals(201);
                expect(res.headers).to.contain.keys('location');
                expect(data).to.not.be.null;
                var accountId = data._id;
                expect(res.headers.location).to.have.string('accounts/' + accountId);
                // Delete account
                adminClient.del(ApiPrefix + '/accounts/' + accountId + '?removing=true', function (err, req, res, data) {
                    expect(err).to.be.null;
                    expect(data).is.empty;
                    expect(res.statusCode).to.equals(204);
                    done();
                });
            });
        });
    });
});