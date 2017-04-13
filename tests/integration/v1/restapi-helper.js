"use strict";
/**
 * Created by Alex Levshin on 20/7/16.
 */
var RootFolder = process.env.ROOT_FOLDER;
var ApiMajorVersion = process.env.API_MAJOR_VERSION;

if (!global.rootRequire) {
    global.rootRequire = function (name) {
        return require(RootFolder + '/' + name);
    };
}

var restify = require('restify');
var _ = require('lodash');
var config = rootRequire('config');
var expect = require('chai').expect;
var SubVersion = config.restapi.getLatestVersion().sub; // YYYY.M.D
var util = require('util');
require('log-timestamp');
var WorktyRepositoryCodePath = RootFolder + '/workties-repository';
var Q = require('Q');

var RestApiHelper = (function () {
   var Workties = [
       {
          name: 'with-delay',
          path: 'unsorted/nodejs/unit-tests/with-delay.zip'
       },
       {
           name: 'without-delay',
           path: 'unsorted/nodejs/unit-tests/without-delay.zip'
       }
   ];
   var ApiPrefix = '/api/v' + ApiMajorVersion;

   // Init the test client using supervisor account (all acl permissions)
   var adminClient = restify.createJsonClient({
       version: SubVersion,
       url: config.restapi.getConnectionString(),
       headers: {
           'Authorization': 'Basic ' + new Buffer(config.supervisor.email + ':' + config.supervisor.password).toString('base64') // supervisor
       },
       rejectUnauthorized: false
   });

   function _error(data) {
       var msg = util.inspect(data, { depth: null });
       console.error(msg);
   }

   function _debug(data) {
       var msg = util.inspect(data, { depth: null });
       console.log(msg);
   }

   function getRandomInt(min, max) {
       return Math.floor(Math.random() * (max - min)) + min;
   }

   function guid() {
       function s4() {
           return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
       }
       return s4() + s4() + '_' + s4() + '_' + s4() + '_' + s4() + '_' + s4() + s4() + s4();
   }

   var _createPromises = function(callback, count) {
       var promises = [];

       for (var idx = 0; idx < count; idx++) {
         promises.push(callback(idx));
       }

       return promises;
   };

   var _createRegularUserAccount = function() {
       return new Q.Promise(function (resolve, reject) {
           try {
               var name = 'regular_user_' + guid();
               adminClient.post(ApiPrefix + '/accounts', {
                   name: name,
                   email: name + '@workty.com',
                   password: name
               }, function (err, req, res, data) {
                   resolve({res: res, data: data});
               });
           } catch (ex) {
               reject(ex);
           }
       });
   };

   var _deleteRegularUserAccount = function(regularUser)  {
       if (!regularUser) return Q.resolve();
       return new Q.Promise(function (resolve, reject) {
            try {
                adminClient.del(ApiPrefix + '/accounts/' + regularUser._id + '?removing=true', function (err, req, res, data) {
                    resolve({res: res});
                });
            } catch (ex) {
                reject(ex);
            }
       });
   };

   var _loginRegularUserAccount = function(email, password) {
       return new Q.Promise(function (resolve, reject) {
           try {
               var regularUserClient = restify.createJsonClient({
                   version: SubVersion,
                   url: config.restapi.getConnectionString(),
                   headers: {
                       'Authorization': 'Basic ' + new Buffer(email + ':' + password).toString('base64')
                   },
                   rejectUnauthorized: false
               });
               resolve({data: regularUserClient});
           } catch (ex) {
               reject(ex);
           }
       });
   };

   var _createWorktyTemplate = function(worktyParams) {
       return new Q.Promise(function (resolve, reject) {
            try {
                var workty = _.find(Workties, function(obj) {
                    return obj.name === worktyParams.name;
                });

                var name = workty.name + '_' + guid();;
                var compressedCode = fs.readFileSync(WorktyRepositoryCodePath + '/' + workty.path);
                adminClient.post(ApiPrefix + '/workties', {
                    name: name,
                    desc: name,
                    compressedCode: compressedCode,
                    template: true
                }, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
       });
   };

   var _deleteWorkty = function(worktyId) {
       if (!worktyId) return Q.resolve();
       return new Q.Promise(function (resolve, reject) {
            try {
                adminClient.del(ApiPrefix + '/workties/' + worktyId, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
       });
   };

   var _getAllWorkties = function(regularUserClient) {
       return new Q.Promise(function (resolve, reject) {
           try {
               var client = regularUserClient || adminClient;
               client.get(ApiPrefix + '/workties', function (err, req, res, data) {
                   resolve({res: res, data: data});
               });
           } catch (ex) {
               reject(ex);
           }
       });
   };

   var _buyWorktyTemplate = function(regularUserClient, worktyTemplateId) {
       return new Q.Promise(function (resolve, reject) {
           try {
               regularUserClient.post(ApiPrefix + '/payments', {worktyId: worktyTemplateId}, function (err, req, res, data) {
                   resolve({res: res, data: data});
               });
           } catch (ex) {
               reject(ex);
           }
       });
   };

   var _createWorkflow = function(regularUserClient) {
        return new Q.Promise(function (resolve, reject) {
            try {
                var name = 'workflow' + '_' + guid();
                regularUserClient.post(ApiPrefix + '/workflows', {
                    name: name,
                    desc: name
                }, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
   };

   var _deleteWorkflow = function(regularUserClient, workflowId) {
       if (!workflowId) return Q.resolve();
       return new Q.Promise(function (resolve, reject) {
            try {
                regularUserClient.del(ApiPrefix + '/workflows/' + workflowId, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
       });
   };

   var _createWorktyInstance = function(regularUserClient, worktyId, workflowId) {
        return new Q.Promise(function (resolve, reject) {
            try {
                var name = 'worktyinstance' + '_' + guid();
                regularUserClient.post(ApiPrefix + '/workflows/' + workflowId + '/worktiesInstances', {
                    name: name,
                    desc: name,
                    worktyId: worktyId,
                    embed: 'properties'
                }, function (err, req, res, data) {
                    resolve({res: res, data: data});
                });
            } catch (ex) {
                reject(ex);
            }
        });
   };

   var _runWorkflow = function (regularUserClient, workflowId) {
       return new Q.Promise(function (resolve, reject) {
           try {
               regularUserClient.put(ApiPrefix + '/workflows/' + workflowId + '/running', function (err, req, res, data) {
                   resolve({res: res, data: data});
               });
           } catch (ex) {
               reject(ex);
           }
       });
   };

   var _stopWorkflow = function (regularUserClient, workflowId) {
       return new Q.Promise(function (resolve, reject) {
           try {
               regularUserClient.del(ApiPrefix + '/workflows/' + workflowId + '/running', function (err, req, res, data) {
                   resolve({res: res, data: data});
               });
           } catch (ex) {
               reject(ex);
           }
       });
   };

   var _getWorkflowState = function (regularUserClient, workflowId, worktiesInstancesIds) {
        var worktiesInstancesIdsPromises = [];

        var _createWorktyInstancePromise = function(worktyInstanceId) {
            return new Q.Promise(function (resolve, reject) {
                try {
                    //_debug(ApiPrefix + '/workflows/' + workflowId + '/worktiesInstances/' + worktyInstanceId);
                    regularUserClient.get(ApiPrefix + '/workflows/' + workflowId + '/worktiesInstances/' + worktyInstanceId + '?embed=state', function (err, req, res, data) {
                        resolve({res: res, data: data});
                    });
                } catch (ex) {
                    reject(ex);
                }
            });
        };

        for (var idx = 0; idx < worktiesInstancesIds.length; idx++) {
            var promise = _createWorktyInstancePromise(worktiesInstancesIds[idx]);
            worktiesInstancesIdsPromises.push(promise);
        }

        return Q.all(worktiesInstancesIdsPromises);
   };

    var _init = function(numOfWorkflows, numOfWorktiesIntances, numOfWorkties, userIdx) {
        var regularUser, regularUserClient;
        var workflowsIds = [];
        var worktiesTemplatesIds = [];
        var worktiesOwnIds = [];
        var worktiesInstances = [];

        return new Q.Promise(function (resolve, reject) {
            _debug('[supervisor] Begin init');
            _debug('[supervisor] Create regular user #' + userIdx);
            // Create regular user (use name as password)
            var promise = _createRegularUserAccount();

            var _onFail = function(err) {
                _error(err);
                reject(err);
            };

            // Login as regular user
            Q.delay(1500).then(function _onSuccess(results) {
                _debug('Wait 1500 msec...');
                return promise;
            })
            .then(function _onSuccess(results) {
                expect(results.res.statusCode).to.equals(201);
                expect(results.data).to.not.be.empty;

                regularUser = results.data;
                _debug('[' + regularUser._id + '] Login as regular user');
                return _loginRegularUserAccount(regularUser.email, regularUser.name);
            }, _onFail)
            .then(function _onSuccess(results) {
                expect(results.data).to.not.be.empty;

                _debug('[' + regularUser._id + '] Get templates and owned workties');
                regularUserClient = results.data;
                return _getAllWorkties(regularUserClient);
            }, _onFail)
            .then(function _onSuccess(results) {
                expect(results.res.statusCode).to.equals(200);
                expect(results.data).to.not.be.empty;

                _.forEach(results.data, function(workty) {
                    if (workty.template === true) {
                        worktiesTemplatesIds.push(workty._id);
                    }
                });

                var buyWorktiesPromises = [];
                for (var idx = 0; idx < numOfWorkties; idx++) {
                    (function(i) {
                        _debug('[' + regularUser._id + '] Buy workty #' + (i + 1));
                        buyWorktiesPromises.push(_buyWorktyTemplate(regularUserClient, worktiesTemplatesIds[i]));
                    })(idx);
                }

                return Q.all(buyWorktiesPromises);
            }, _onFail)
            .then(function _onSuccess(results) {
                for (var idx = 0; idx < numOfWorkties; idx++) {
                    (function(i) {
                        expect(results[i].res.statusCode).to.equals(201);
                        expect(results[i].data).to.not.be.empty;
                        worktiesOwnIds.push(results[i].data.worktyId);
                    })(idx);
                }

                var createWorfklowsPromises = [];
                for (idx = 0; idx < numOfWorkflows; idx++) {
                    _debug('[' + regularUser._id + '] Create workflow #' + (idx + 1));
                    createWorfklowsPromises.push(_createWorkflow(regularUserClient));
                }

                return Q.all(createWorfklowsPromises);
            }, _onFail)
            .then(function _onSuccess(results) {
                for (var idx = 0; idx < numOfWorkflows; idx++) {
                    (function(i) {
                        expect(results[i].res.statusCode).to.equals(201);
                        expect(results[i].data).to.not.be.empty;
                        workflowsIds.push(results[i].data._id);
                    })(idx);
                }

                var createWorktyInstancePromises = [];
                for (var workflowIdx = 0; workflowIdx < numOfWorkflows; workflowIdx++) {
                    for (var worktyInstanceIdx = 0; worktyInstanceIdx < numOfWorktiesIntances; worktyInstanceIdx++) {
                        (function(i, j) {
                            _debug('[' + regularUser._id + '] Create workty instance #' + (j + 1) + ' for workflow #' + (i + 1));
                            var worktyIdx = getRandomInt(0, numOfWorkties);
                            createWorktyInstancePromises.push(_createWorktyInstance(regularUserClient, worktiesOwnIds[worktyIdx], workflowsIds[i]));
                        })(workflowIdx, worktyInstanceIdx);
                    }
                }

                return Q.all(createWorktyInstancePromises);
            }, _onFail)
            .then(function _onSuccess(results) {
                for (var idx = 0; idx < results.length; idx++) {
                    (function(i) {
                        expect(results[i].res.statusCode).to.equals(201);
                        expect(results[i].data).to.not.be.empty;
                        worktiesInstances.push(results[i].data);
                    })(idx);
                }
            }, _onFail)
            .finally(function() {
                _debug('[' + regularUser._id + '] End init');
                resolve({regularUser: regularUser, regularUserClient: regularUserClient, workflowsIds: workflowsIds, worktiesInstances: worktiesInstances, worktiesOwnIds: worktiesOwnIds});
            });
        });
    };

    var _wait = function(regularUserClient, workflowsIds, worktiesInstances, stateToFind) {
        var worktiesInstancesGroup = [];

        var _createGetWorkflowStatePromise = function(worktiesInstancesGroup) {
            return new Q.Promise(function (resolve, reject) {
                //_debug(worktiesInstancesGroup);
                _getWorkflowState(regularUserClient, worktiesInstancesGroup.workflowId, worktiesInstancesGroup.worktiesInstancesIds)
                    .then(function _onSuccess(results) {
                        //_debug(results.length);
                        var initialCount = 0;
                        var runningCount = 0;
                        var waitingCount = 0;
                        var completedCount = 0;
                        for (var idx = 0; idx < results.length; idx++) {
                            (function (i) {
                               // _debug(results[i].res.statusCode + ',' + results[i].data._id.toString() + ',' + results[i].data.stateId.name);
                                if (results[i].res.statusCode !== 500) {
                                    switch (results[i].data.stateId.name) {
                                        case 'initial':
                                            ++initialCount;
                                            break;
                                        case 'running':
                                            ++runningCount;
                                            break;
                                        case 'waiting':
                                            ++waitingCount;
                                            break;
                                        case 'completed':
                                            ++completedCount;
                                            break;
                                    }

                                    if (results[i].data.stateId.name === stateToFind) {
                                        worktiesInstancesGroup.worktiesInstancesIds = _.dropWhile(worktiesInstancesGroup.worktiesInstancesIds, function _onEachWorktyInstance(worktyInstanceId) {
                                            return worktyInstanceId === results[i].data._id;
                                        });
                                    }
                                } else {
                                    _error('Workflow ' + worktiesInstancesGroup.workflowId + ' has status code ' + results[i].res.statusCode);
                                    reject({err: results[i].res.statusCode, workflowId: worktiesInstancesGroup.workflowId});
                                }

                                if (i === results.length - 1) {
                                    resolve({data: {
                                        workflowId: worktiesInstancesGroup.workflowId,
                                        stats: {
                                            initial: initialCount,
                                            waiting: waitingCount,
                                            running: runningCount,
                                            completed: completedCount
                                        }}});
                                }
                            })(idx);
                        }
                    }, function _onError(err) {
                        _error(err);
                        reject({err: err, workflowId: worktiesInstancesGroup.workflowId});
                    });
            });
        };

        for (var workflowIdx = 0; workflowIdx < workflowsIds.length; workflowIdx++) {
            var workflowId = workflowsIds[workflowIdx];
            var filtered = _.filter(worktiesInstances, function(worktyInstance) {
                return worktyInstance.workflowId.toString() === workflowId;
            });

            filtered = filtered.map(function (worktyInstance) {
                return worktyInstance._id;
            });

            worktiesInstancesGroup.push({workflowId: workflowId, worktiesInstancesIds: filtered});
        }

        var worktiesInstancesGroupPromises = [];

        for (var idx = 0; idx < worktiesInstancesGroup.length; idx++) {
            (function(i) {
                worktiesInstancesGroupPromises.push(_createGetWorkflowStatePromise(worktiesInstancesGroup[i]));
            })(idx);
        }

        return Q.allSettled(worktiesInstancesGroupPromises);
    };

    var _run = function(regularUserClient, regularUser, workflowsIds) {
        var runWorkflowsPromises = [];

        for (var idx = 0; idx < workflowsIds.length; idx++) {
            (function(i) {
                _debug('[' + regularUser._id + '] Run workflow ' + workflowsIds[i]);
                runWorkflowsPromises.push(_runWorkflow(regularUserClient, workflowsIds[i]));
            })(idx);
        }

        return Q.allSettled(runWorkflowsPromises);
    };

    var _stop = function(regularUserClient, regularUser, workflowsIds) {
        var stopWorkflowsPromises = [];

        for (var idx = 0; idx < workflowsIds.length; idx++) {
            (function(i) {
                _debug('[' + regularUser._id + '] Stop workflow ' + workflowsIds[i]);
                stopWorkflowsPromises.push(_stopWorkflow(regularUserClient, workflowsIds[i]));
            })(idx);
        }

        return Q.allSettled(stopWorkflowsPromises);
    };

    var _doCleanup = function(data, done) {
        _debug('[supervisor] Begin all clean up');
        var cleanupPromises = [];

        _.forEach(data, function _onEachResult(dataResult) {
            cleanupPromises.push(_cleanup(dataResult));
        });

        Q.all(cleanupPromises).then(function (results) {
            _debug('[supervisor] End all clean up');
            done();
        });
    };

    var _cleanup = function(data) {
        return new Q.Promise(function (resolve, reject) {
            _debug('[' + data.regularUser._id + '] Begin clean up');
            var worktiesPromises = [];

            _.forEach(data.worktiesOwnIds, function (worktyOwnId) {
                worktiesPromises.push(_deleteWorkty(worktyOwnId));
            });

            _debug('[' + data.regularUser._id + '] Delete workties');
            Q.all(worktiesPromises).then(function _onSuccess(results) {
                _.forEach(results, function (result) {
                    expect(result.res.statusCode).to.equals(204);
                });
                _debug('[' + data.regularUser._id + '] Delete workflows');

                var workflowsPromises = [];
                _.forEach(data.workflowsIds, function (workflowId) {
                    workflowsPromises.push(_deleteWorkflow(data.regularUserClient, workflowId));
                });

                return Q.all(workflowsPromises);
            })
            .then(function _onSuccess(results) {
                _.forEach(results, function (result) {
                    expect(result.res.statusCode).to.equals(204);
                });
                _debug('[' + data.regularUser._id + '] Delete regular user');
                return _deleteRegularUserAccount(data.regularUser);
            })
            .then(function _onSuccess(results) {
                expect(results.res.statusCode).to.equals(204);
            })
            .finally(function () {
                _debug('[' + data.regularUser._id + '] End clean up');
                resolve();
            });
        });
    };

    var _doRunTest = function(usersOptions, pollingTimeoutMs, done) {
        var data = [];
        var userIdx = 1;
        var numOfAllWorkflows = 0;

        var lastResult = usersOptions.reduce(function _onEachUserOptions(previousPromise, userOptions) {
            return previousPromise.then(function _onSuccess(results) {
                if (results) {
                    data.push(results);
                }

                numOfAllWorkflows += userOptions.numOfWorkflows;
                return _init(userOptions.numOfWorkflows, userOptions.numOfWorktiesInstances, userOptions.numOfWorkties, userIdx++);
            });
        }, Q.resolve());

        lastResult.then(function _onSuccess(results) {
           data.push(results);

            var lastRunResult = data.reduce(function _onEachResult(previousPromise, result) {
                return previousPromise.then(function _onSuccess(results) {
                    return Q.delay(1000).then(function (results) {
                        return _run(result.regularUserClient, result.regularUser, result.workflowsIds);
                    });
                });
            }, Q.resolve());

            return lastRunResult;
        })
        .then(function _onSuccess(results) {
            for (var idx = 0; idx < results.length; idx++) {
                for (var jdx = 0; jdx < results[idx].length; jdx++) {
                    (function (i,j) {
                        expect(results[i][j].res.statusCode).to.equals(200);
                        expect(results[i][j].data).to.not.be.empty;
                    })(idx, jdx);
                }
            }

            var attempt = 0;
            var _resolve, _reject;
            var _pollingFn = function(resolve, reject) {
                if (attempt === 0) {
                    _resolve = resolve;
                    _reject = reject;
                }

                var waitPromises = [];
                _.forEach(data, function _onEachUserOptions(dataResult) {
                    waitPromises.push(_wait(dataResult.regularUserClient, dataResult.workflowsIds, dataResult.worktiesInstances));
                })

                _debug('Polling attempt: ' + (attempt + 1));
                Q.all(waitPromises)
                    .then(function _onSuccess(results) {
                        var workflowsCompletedCount = 0;
                        for (var idx = 0; idx < results.length; idx++) {
                            for (var jdx = 0; jdx < results[idx].length; jdx++) {
                                (function (i,j) {
                                    var result = results[i][j].value;
                                    //_error(results[i][j].err);
                                    expect(result.err).to.be.undefined;
                                    expect(result.data).to.not.be.empty;

                                    if (!result.data.err) {
                                        var stats = result.data.stats;
                                        if (stats.completed < (stats.initial + stats.waiting + stats.running)) {
                                            _debug('Workflow ' + result.data.workflowId + ' (initial: ' + stats.initial + ', waiting: ' + stats.waiting + ', running: ' + stats.running + ', completed: ' + stats.completed + ')');
                                        } else {
                                            ++workflowsCompletedCount;
                                        }
                                    } else {
                                        _error('Workflow ' + result.data.workflowId + ' has error');
                                    }

                                    if (j === results[i].length - 1 && i === results.length - 1) {
                                        _debug('Workflows ' + workflowsCompletedCount + ' completed');
                                        if (numOfAllWorkflows === workflowsCompletedCount) {
                                            _resolve(results);
                                        } else {
                                            attempt++;
                                            setTimeout(_pollingFn, pollingTimeoutMs);
                                        }
                                    }
                                })(idx, jdx);
                            }
                        }
                    }, function _onError(err) {
                        _reject(err);
                    });
            };

            return new Q.Promise(_pollingFn);
        })
        .done(function _onSuccess(results) {
            _doCleanup(data, done);
        }, function _onError(err) {
            _error(err);
            _doCleanup(data, done);
        });
    };

    var _doStopTest = function(usersOptions, pollingTimeoutMs, done) {
        var data = [];
        var userIdx = 1;
        var numOfAllWorkflows = 0;

        var lastResult = usersOptions.reduce(function _onEachUserOptions(previousPromise, userOptions) {
            return previousPromise.then(function _onSuccess(results) {
                if (results) {
                    data.push(results);
                }

                numOfAllWorkflows += userOptions.numOfWorkflows;
                return _init(userOptions.numOfWorkflows, userOptions.numOfWorktiesInstances, userOptions.numOfWorkties, userIdx++);
            });
        }, Q.resolve());

        lastResult.then(function _onSuccess(results) {
            data.push(results);

            var lastRunResult = data.reduce(function _onEachResult(previousPromise, result) {
                return previousPromise.then(function _onSuccess(results) {
                    return Q.delay(1000).then(function (results) {
                        return _run(result.regularUserClient, result.regularUser, result.workflowsIds);
                    });
                });
            }, Q.resolve());

            return lastRunResult;
        })
        .then(function _onSuccess(results) {
            // Stop the all workflows after 10 seconds
            return Q.delay(5000).then(function _onSuccess(results) {
                var lastStopResult = data.reduce(function _onEachResult(previousPromise, result) {
                    return previousPromise.then(function _onSuccess(results) {
                        return Q.delay(1000).then(function (results) {
                            return _stop(result.regularUserClient, result.regularUser, result.workflowsIds);
                        });
                    });
                }, Q.resolve());

                return lastStopResult;
            });
        })
        .then(function _onSuccess(results) {
            var attempt = 0;
            var _resolve, _reject;
            var _pollingFn = function(resolve, reject) {
                if (attempt === 0) {
                    _resolve = resolve;
                    _reject = reject;
                }

                var waitPromises = [];
                _.forEach(data, function _onEachUserOptions(dataResult) {
                    waitPromises.push(_wait(dataResult.regularUserClient, dataResult.workflowsIds, dataResult.worktiesInstances, 'initial'));
                });

                _debug('Polling attempt (initial): ' + (attempt + 1));
                Q.all(waitPromises)
                    .then(function _onSuccess(results) {
                        var workflowsInitialCount = 0;
                        for (var idx = 0; idx < results.length; idx++) {
                            for (var jdx = 0; jdx < results[idx].length; jdx++) {
                                (function (i, j) {
                                    var result = results[i][j].value;
                                    expect(result.err).to.be.undefined;
                                    expect(result.data).to.not.be.empty;

                                    if (!result.data.err) {
                                        var stats = result.data.stats;
                                        if (stats.completed !== 0 || stats.waiting !== 0 || stats.running !== 0) {
                                            _debug('Workflow ' + result.data.workflowId + ' (initial: ' + stats.initial + ', waiting: ' + stats.waiting + ', running: ' + stats.running + ', completed: ' + stats.completed + ')');
                                        } else {
                                            ++workflowsInitialCount;
                                        }
                                    } else {
                                        _error('Workflow ' + result.data.workflowId + ' has error');
                                    }

                                    if (j === results[i].length - 1 && i === results.length - 1) {
                                        if (numOfAllWorkflows === workflowsInitialCount) {
                                            _resolve(results);
                                        } else {
                                            attempt++;
                                            setTimeout(_pollingFn, pollingTimeoutMs);
                                        }
                                    }
                                })(idx, jdx);
                            }
                        }
                    }, function _onError(err) {
                        _reject(err);
                    });
            };

            return new Q.Promise(_pollingFn);
        })
        .then(function _onSuccess(results) {
            // Run the all workflows after 10 seconds
            return Q.delay(5000).then(function _onSuccess(results) {
                var lastRunResult = data.reduce(function _onEachResult(previousPromise, result) {
                    return previousPromise.then(function _onSuccess(results) {
                        return Q.delay(1000).then(function (results) {
                            return _run(result.regularUserClient, result.regularUser, result.workflowsIds);
                        });
                    });
                }, Q.resolve());

                return lastRunResult;
            });
        })
        .then(function _onSuccess(results) {
            for (var idx = 0; idx < results.length; idx++) {
                for (var jdx = 0; jdx < results[idx].length; jdx++) {
                    (function (i, j) {
                        expect(results[i][j].res.statusCode).to.equals(200);
                        expect(results[i][j].data).to.not.be.empty;
                    })(idx, jdx);
                }
            }

            var attempt = 0;
            var _resolve, _reject;
            var _pollingFn = function(resolve, reject) {
                if (attempt === 0) {
                    _resolve = resolve;
                    _reject = reject;
                }

                var waitPromises = [];
                _.forEach(data, function _onEachUserOptions(dataResult) {
                    waitPromises.push(_wait(dataResult.regularUserClient, dataResult.workflowsIds, dataResult.worktiesInstances, 'completed'));
                });

                _debug('Polling attempt (completed): ' + (attempt + 1));
                Q.all(waitPromises)
                    .then(function _onSuccess(results) {
                        var workflowsCompletedCount = 0;
                        for (var idx = 0; idx < results.length; idx++) {
                            for (var jdx = 0; jdx < results[idx].length; jdx++) {
                                (function (i,j) {
                                    var result = results[i][j].value;
                                    //_error(results[i][j].err);
                                    expect(result.err).to.be.undefined;
                                    expect(result.data).to.not.be.empty;

                                    if (!result.data.err) {
                                        var stats = result.data.stats;
                                        if (stats.completed < (stats.initial + stats.waiting + stats.running)) {
                                            _debug('Workflow ' + result.data.workflowId + ' (initial: ' + stats.initial + ', waiting: ' + stats.waiting + ', running: ' + stats.running + ', completed: ' + stats.completed + ')');
                                        } else {
                                            ++workflowsCompletedCount;
                                        }
                                    } else {
                                        _error('Workflow ' + result.data.workflowId + ' has error');
                                    }

                                    if (j === results[i].length - 1 && i === results.length - 1) {
                                        _debug('Workflows ' + workflowsCompletedCount + ' completed');
                                        if (numOfAllWorkflows === workflowsCompletedCount) {
                                            _resolve(results);
                                        } else {
                                            attempt++;
                                            setTimeout(_pollingFn, pollingTimeoutMs);
                                        }
                                    }
                                })(idx, jdx);
                            }
                        }
                    }, function _onError(err) {
                        _reject(err);
                    });
            };

            return new Q.Promise(_pollingFn);
        })
        .done(function _onSuccess(results) {
            _doCleanup(data, done);
        }, function _onError(err) {
            _error(err);
            _doCleanup(data, done);
        });
    };

    return {
       createPromises: _createPromises,
       createRegularUserAccount: _createRegularUserAccount,
       deleteRegularUserAccount:_deleteRegularUserAccount,
       loginRegularUserAccount: _loginRegularUserAccount,
       createWorktyTemplate:  _createWorktyTemplate,
       deleteWorkty: _deleteWorkty,
       buyWorktyTemplate: _buyWorktyTemplate,
       getAllWorkties: _getAllWorkties,
       createWorkflow: _createWorkflow,
       deleteWorkflow: _deleteWorkflow,
       createWorktyInstance: _createWorktyInstance,
       runWorkflow: _runWorkflow,
       stopWorkflow: _stopWorkflow,
       getWorkflowState: _getWorkflowState,
       doRunTest: _doRunTest,
       doStopTest: _doStopTest
    }
})();

module.exports = RestApiHelper;


