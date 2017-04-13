'use strict';
/**
 * Created by Alex Levshin on 12/11/16.
 */
require('log-timestamp');
var _ = require('lodash');
var util = require('util');
var fs = require('fs');
var config = rootRequire('config');
var latestVersion = config.restapi.getLatestVersion();
var ApiPrefix = 'api/v' + latestVersion.major + '/';
var db = rootRequire('database/db').getInstance(config.supervisor.name);
var Workflow = require('../workflow');
var protocolClient = rootRequire('shared/protocols/v' + latestVersion.major + '/client-sv-workflows.module').OPERATIONS;
var errorSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/error-controller')();
var LoggerController = rootRequire('api/shared-controllers/logger-controller')();
var Q = require('q');

// TODO:
// - Check for running state
var WorkflowsContext = function CreateWorkflowsContext(contextOwner, contextName, contextLocator) {
    var _workflows = [];
    var _sockets = [];
    var _devicesContext = null;
    var _dictionariesContext = null;
    var _refreshTimer = null;
    var _version = config.restapi.getLatestVersion();
    var _id = contextOwner.id;
    var _refreshingActive = false;

    _getAll();

    function _getDevicesContext() {
        if (!_devicesContext) {
            _devicesContext = contextLocator.get(_id, 'devices');
        }
        return _devicesContext;
    }

    function _getDictionariesContext() {
        if (!_dictionariesContext) {
            _dictionariesContext = contextLocator.get(_id, 'dictionaries');
        }
        return _dictionariesContext;
    }

    function _error(data) {
        var msg =  '[' + _id + '] [' + contextName + ' context] ' + util.inspect(data, {depth: null});
        console.error(msg);
        LoggerController.error(msg);
    }

    function _debug(data) {
        var msg = '[' + _id + '] [' + contextName + ' context] ' + util.inspect(data, {depth: null});
        console.log(msg);
        LoggerController.debug(msg);
    }

    var _runGC = function() {
        if (global.gc) {
            _debug("Mem usage Pre-GC "+util.inspect(process.memoryUsage()));
            global.gc();
            _debug("Mem usage Post-GC "+util.inspect(process.memoryUsage()));
        }
    };

    function _deleteFolderRecursive(path) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(function(file, index){
                var curPath = path + '/' + file;
                if (fs.lstatSync(curPath).isDirectory()) {
                    _deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    }

    // Attach refreshing handler
    _refreshTimer = setInterval(_refreshWaitingWorkflows, db.findContextByName(contextName).refreshingTimeout);

    function _contextChanged(data) {
        // Send notification to all clients
        _.forEach(_sockets, function _onEachSocket(socket) {
            socket.emit(protocolClient.CHANGED, data);
        });
    }

    function _contextChangedNoError(data, requestId) {
        var inputData = {err: null};
        _.assign(inputData, data);
        if (requestId) {
            inputData.requestId = requestId;
        }
        _contextChanged(inputData);
    }

    function _contextChangedWithError(err, requestId) {
        var inputData = {err: err};
        if (requestId) {
            inputData.requestId = requestId;
        }
        _contextChanged(inputData);
    }

    function _freeWorkerDevice(workflow) {
        _getDevicesContext();
        if (_devicesContext) {
            _devicesContext.freeSocket(workflow.device.id);
        }
        workflow.device = null;
    }

    function _worktyInstanceExecute(data) {
        _executeWorktyInstanceCode(data.executeData);
    }

    function _workflowStateChanged(result) {
        var requestId;
        if (result && result.requestId) {
            requestId = result.requestId;
            delete result.requestId;
        }

        var _stateChangedFn = function(err, updatedWorktyInstance) {
            // Send data to web socket client
            var error = result.err || err;
            if (error) {
                _error(error);
                _contextChangedWithError(error, requestId);
            } else {
                var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
                    return workflow.getId() === result.id;
                });

                if (workflow) {
                    if (result.workflowCompleted) {
                        // Return worker device back to pool
                        _getDevicesContext();
                        if (_devicesContext) {
                            var inputData = {device: {id: workflow.device.id}};
                            _devicesContext.release(inputData, function _onDeviceReturned(err, device) {
                                if (err) {
                                    _error(err);
                                    _contextChangedWithError(err, requestId);
                                } else {
                                    _freeWorkerDevice(workflow);
                                    _contextChangedNoError({workflow: result}, requestId);
                                }
                            });
                        }
                    } else {
                        _contextChangedNoError({workflow: result}, requestId);
                    }
                }
            }
        };

       // _debug(result);
        if (result.worktyInstance) {
            var _worktyInstanceStates = _getDictionariesContext().get('workty-instance-states');
            var worktyInstanceState = _.find(_worktyInstanceStates, function (worktyInstanceState) {
                return worktyInstanceState.name === result.worktyInstance.state;
            });

            var inputData = {id: result.id, accountId: _id, worktyInstanceId: result.worktyInstance.id, stateId: worktyInstanceState.id};
            inputData.hasAdminRole = true;
            //_debug('Change workty instance id ' + result.worktyInstance.id + ' state to ' + result.worktyInstance.state);
            db.updateWorktyInstance(inputData, function onWorktyInstanceUpdated(err, updatedWorktyInstance) {
                _stateChangedFn(err, updatedWorktyInstance);
            });
        } else {
            _stateChangedFn();
        }
    }

    function _initWorkflow(workflow, requestId) {
        var newWorkflow = _addWorkflow(workflow, requestId);
        newWorkflow.init();
    }

    function _addWorkflow(workflow, requestId) {
        _debug('Adding workflow ' + workflow._id);

        // Add workflow from db data
        var workflowParms = {
            contextId: _id,
            id: workflow._id.toString(),
            device: null,
            requestId: requestId
        };

        var newWorkflow = new Workflow(workflowParms);
        var inputData = {desc: workflow.desc, name: workflow.name};
        newWorkflow.on('worktyInstanceExecute', _worktyInstanceExecute);
        newWorkflow.on('changed', _workflowStateChanged);
        newWorkflow.update(inputData);
        _workflows.push(newWorkflow);

        return newWorkflow;
    }

    function _updateWorkflow(workflow, requestId) {
        _debug('Updating workflow ' + workflow._id);

        // Update workflow from db data
        var existingWorkflow = _.find(_workflows, function _onEachWorkflow(w) {
            return w.getId() === workflow._id.toString();
        });

        if (existingWorkflow) {
            var inputData = {desc: workflow.desc, name: workflow.name};
            existingWorkflow.update(inputData);
            var result = {id: existingWorkflow.getId(), desc: workflow.desc, name: workflow.name};
            _contextChangedNoError({workflow: result}, requestId);
        }
    }

    function _delWorkflow(workflow, requestId) {
        _debug('Deleting workflow ' + workflow._id);

        var existingWorkflow = _.find(_workflows, function _onEachWorkflow(w) {
            return w.getId() === workflow._id.toString();
        });

        if (existingWorkflow) {
            existingWorkflow.destroy();
            _workflows = _.without(_workflows, existingWorkflow);
            var result = {id: existingWorkflow.getId(), deleted: true};
            _contextChangedNoError({workflow: result}, requestId);
        }
    }

    function _executeWorktyInstanceCode(data) {
        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflowId;
        });

        if (workflow) {
            // Get compressed code from workty
            var inputData = {id: data.worktyId, accountId: _id, embed: 'languagetype, category'};
            /*
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }*/
            db.getWorktyById(inputData, function _onWorktyReturned(err, workty) {
                if (err) {
                    _error(err);
                    data.cb.call(data.worktyInstance, err);
                } else {
                    //_debug(workty.compressedCode.length);
                    _getDevicesContext();
                    if (_devicesContext) {
                        var workerInputData = {
                            device: workflow.device,
                            workerProperties: {
                                worktyInstanceProperties: data,
                                worktyProperties: {
                                    languageType: db.getLanguageTypeName({version: workty.languageTypeId.name}).name,
                                    compressedCode: workty.compressedCode,
                                    name: workty.name,
                                    categoryPath: db.getCategoryPath(workty.categoryId),
                                    entryPointModuleFileName: workty.entryPointModuleFileName
                                },
                                version: _version
                            }
                        };

                        _devicesContext.executeCode(workerInputData, function _onCodeExecuted(err, result) {
                            _runGC();
                            if (err) {
                                _error(err);
                                data.cb.call(data.worktyInstance, err);
                                var workflowInputData = {
                                    workflow: {id: workflow.getId()},
                                    //shouldReleaseDevice: true
                                };
                                var requestId = workflow.getRequestId();
                                // Pause workflow
                                _pause(workflowInputData, requestId);
                            } else {
                                data.cb.call(data.worktyInstance, null, result);
                            }
                        });
                    }
                }
            });
        }
    }

    function _getAll(data, requestId) {
        var inputData = {accountId: _id, embed: 'worktiesInstances.state,worktiesInstances.properties'};
        if (data && data.embed) {
            inputData.embed += ',' + data.embed;
        }

        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        db.getAllWorkflows(inputData, function _onWorkflowsReturned(err, workflows) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _workflows = [];
                if (workflows.length === 0) {
                    _contextChangedNoError({workflow: {}}, requestId);
                } else {
                    _.forEach(workflows, function _onEachWorkflow(workflow) {
                        var newWorkflow = _addWorkflow(workflow, requestId);
                        _.forEach(workflow.worktiesInstancesIds, function _onEachWorktyInstance(worktyInstance) {
                            newWorkflow.addWorktyInstance(worktyInstance);
                        });
                        newWorkflow.init();
                    });
                }
            }
        });
    }

    function _getById(data, requestId) {
        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflow.id;
        });

        if (!workflow) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var inputData = {accountId: _id, id: workflow.getId(), embed: 'worktiesInstances.state'};
        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        db.getWorkflowById(inputData, function _onWorkflowReturned(err, workflow) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var newWorkflow = _addWorkflow(workflow, requestId);
                _.forEach(workflow.worktiesInstancesIds, function _onEachWorktyInstance(worktyInstance) {
                    newWorkflow.addWorktyInstance(worktyInstance);
                });
                newWorkflow.init();
            }
        });
    }

    function _add(data, requestId) {
        var onWorkflowAdded = function(err, addedWorkflow) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            }
            else {
                _initWorkflow(addedWorkflow, requestId);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.workflow;
            inputData.accountId = _id;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            db.addWorkflow(inputData, onWorkflowAdded);
        } else {
            _initWorkflow(data.workflow, requestId);
        }
    }

    function _update(data, requestId) {
        var id = data.workflow.id || data.workflow._id;
        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === id;
        });

        if (!workflow) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var onWorkflowUpdated = function (err, updatedWorkflow) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _updateWorkflow(updatedWorkflow, requestId);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.workflow;
            inputData.accountId = _id;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            db.updateWorkflow(inputData, onWorkflowUpdated);
        } else {
            _updateWorkflow(data.workflow, requestId);
        }
    }

    function _del(data, requestId) {
        var id = data.workflow.id || data.workflow._id;
        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === id;
        });

        if (workflow) {
            var onWorkflowDeleted = function (err, deletedWorkflow) {
                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    _delWorkflow(deletedWorkflow, requestId);
                }
            };

            var deleteWorkflow = function() {
                if (!data.skipDbOperation) {
                    var inputData = {id: workflow.getId(), accountId: _id};
                    if (_.has(data, 'hasAdminRole')) {
                        inputData.hasAdminRole = data.hasAdminRole;
                    }
                    db.delWorkflow(inputData, onWorkflowDeleted);
                } else {
                    onWorkflowDeleted(null, data.workflow);
                }
            };

            // Return worker device back to pool
            if (workflow.device !== null) {
                _getDevicesContext();
                if (_devicesContext) {
                    var inputData = {device: {id: workflow.device.id}};
                    _devicesContext.release(inputData, function _onDeviceReturned(err, device) {
                        if (err) {
                            _error(err);
                            _contextChangedWithError(err, requestId);
                        } else {
                            _freeWorkerDevice(workflow);
                            deleteWorkflow();
                        }
                    });
                }
            } else {
                deleteWorkflow();
            }
        }
    }

    function _refreshWaitingWorkflows(data, requestId) {
        if (_refreshingActive) {
            return;
        }

        var waitingWorkflows = _.filter(_workflows, function _onEachWorkflow(workflow) {
            var waitingWorkflow = _.find(workflow.getWorktiesInstances(), function(worktyInstance) {
                return worktyInstance.state === 'waiting';
            });

            return _.isUndefined(waitingWorkflow) === false;
        });

        //_debug('Waiting workflows ' + waitingWorkflows.length);

        if (waitingWorkflows.length > 0) {
            _refreshingActive = true;

            var lastResult = waitingWorkflows.reduce(function _onEachWaitingWorkflow(previousPromise, waitingWorkflow) {
                return previousPromise.then(function _onSuccess(results) {
                    var inputData = {workflow: {id: waitingWorkflow.getId()}};
                    return _run(inputData, requestId);
                });
            }, Q.resolve());

            lastResult.then(function _onSuccess(results){
                // handle success
                _refreshingActive = false;
            }).catch(function _onFailure(err) {
                // handle failure
                _error(err);
                _refreshingActive = false;
            });
        }
    }

    function _run(data, requestId) {
        var deferred = Q.defer();

        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflow.id;
        });

        if (!workflow) {
            var entityNotFoundError = errorSupervisorController.createEntityNotFound({inputParameters: data});
            _contextChangedWithError(entityNotFoundError, requestId);
            deferred.reject(new Error(entityNotFoundError));
            return;
        }

        // Get free worker device and book it
        _getDevicesContext();
        if (_devicesContext) {
            var inputData = {device: {}};
            _devicesContext.borrow(inputData, function _onDeviceBorrowed(err, device) {
                if (err) {
                    //_error(err);
                    _contextChangedWithError(err, requestId);
                    var inputData = {workflow: {id: workflow.getId()}};
                    // Pause workflow
                    _pause(inputData, requestId);
                    deferred.reject(new Error(err));
                } else {
                    _debug('Running workflow ' + workflow.getId());
                    workflow.device = device;
                    // Go to running state
                    workflow.run();
                    deferred.resolve(workflow);
                }
            });
        } else {
            deferred.reject(new Error('No device context was found'));
            return;
        }

        return deferred.promise;
    }

    function _pause(data, requestId) {
        var deferred = Q.defer();

        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflow.id;
        });

        if (!workflow) {
            var entityNotFoundError = errorSupervisorController.createEntityNotFound({inputParameters: data});
            _contextChangedWithError(entityNotFoundError, requestId);
            deferred.reject(new Error(entityNotFoundError));
            return;
        }

        if (workflow.device) {
            // Return worker device back to pool
            _getDevicesContext();
            if (_devicesContext) {
                var inputData = {device: {id: workflow.device.id}};
                _devicesContext.release(inputData, function _onDeviceReturned(err, device) {
                    if (err) {
                        _error(err);
                        _contextChangedWithError(err, requestId);
                        deferred.reject(new Error(err));
                    } else {
                        _debug('Pausing workflow ' + workflow.getId() + ' with releasing device');
                        _freeWorkerDevice(workflow);
                        workflow.pause(data);
                        deferred.resolve(data);
                    }
                });
            } else {
                deferred.reject(new Error('No device context was found'));
            }
        } else {
            _debug('Pausing workflow ' + workflow.getId() + ', no device release');
            workflow.pause(data);
            deferred.resolve(data);
            return;
        }

        return deferred.promise;
    }

    function _stop(data, requestId) {
        var deferred = Q.defer();

        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflow.id;
        });

        if (!workflow) {
            var entityNotFoundError = errorSupervisorController.createEntityNotFound({inputParameters: data});
            _contextChangedWithError(entityNotFoundError, requestId);
            deferred.reject(new Error(entityNotFoundError));
            return;
        }

        // Return worker device back to pool
        if (workflow.device) {
            _getDevicesContext();
            if (_devicesContext) {
                var inputData = {device: {id: workflow.device.id}};
                _devicesContext.release(inputData, function _onDeviceReturned(err, device) {
                    if (err) {
                        _error(err);
                        _contextChangedWithError(err, requestId);
                        deferred.reject(new Error(err));
                    } else {
                        _debug('Stopping workflow ' + workflow.getId() + ' with releasing device');
                        _freeWorkerDevice(workflow);
                        workflow.stop();
                        deferred.resolve(data);
                    }
                });
            } else {
                deferred.reject(new Error('No device context was found'));
                return;
            }
        } else {
            _debug('Stopping workflow ' + workflow.getId() + ', no device release');
            workflow.stop();
            deferred.resolve(data);
            return;
        }

        return deferred.promise;
    }

    function _initWorktyInstance(workflow, addedWorktyInstance) {
        //_debug('init');
        var newWorktyInstance = workflow.addWorktyInstance(addedWorktyInstance);
        // Go to initial state
        newWorktyInstance.init();
    }

    function _addWorktyInstance(data, requestId) {
        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflow.id;
        });

        if (!workflow) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}, requestId));
            return;
        }

        var onWorktyInstanceAdded = function(err, addedWorktyInstance) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _initWorktyInstance(workflow, addedWorktyInstance);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = {id: workflow.getId(), accountId: _id, worktyId: data.workty.id, desc: data.workflow.worktyInstance.desc, embed: 'state,properties'};
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            db.addWorktyInstance(inputData, onWorktyInstanceAdded);
        } else {
            onWorktyInstanceAdded(null, data.workflow.worktyInstance);
        }
    }

    function _updateWorktyInstance(data, requestId) {
        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflow.id;
        });

        if (!workflow) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var onWorktyInstanceUpdated = function(err, updatedWorktyInstance) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                workflow.updateWorktyInstance(updatedWorktyInstance);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = {id: workflow.getId(), accountId: _id, worktyInstanceId: data.workflow.worktyInstance.id, desc: data.workflow.worktyInstance.desc};
            if (_.has(data, 'embed')) {
                inputData.embed = data.embed;
            }

            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
                if (_.has(data.workflow.worktyInstance, 'stateId')) {
                    inputData.stateId = data.workflow.worktyInstance.stateId;
                }
            }

            db.updateWorktyInstance(inputData, onWorktyInstanceUpdated);
        } else {
            onWorktyInstanceUpdated(null, data.workflow.worktyInstance);
        }
    }

    function _delWorktyInstance(data, requestId) {
        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflow.id;
        });

        if (!workflow) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var onWorktyInstanceDeleted = function(err, deletedWorktyInstance) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                workflow.delWorktyInstance(data.workflow.worktyInstance.id);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = {id: workflow.getId(), accountId: _id, worktyInstanceId: data.workflow.worktyInstance.id};
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }

            db.delWorktyInstance(inputData, onWorktyInstanceDeleted);
        } else {
            onWorktyInstanceDeleted(null, null);
        }
    }

    function _updateWorktyInstanceProperty(data, requestId) {
        var workflow = _.find(_workflows, function _onEachWorkflow(workflow) {
            return workflow.getId() === data.workflow.id;
        });

        if (!workflow) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}, requestId));
            return;
        }

        var worktyInstance = _.find(workflow.getWorktiesInstances(), function _onEachWorkflowWorktyInstance(worktyInstance) {
            return worktyInstance.getId() === data.workflow.worktyInstance.id;
        });

        if (!worktyInstance) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({ nputParameters: data}, requestId));
            return;
        }

        var onWorktyInstancePropertyUpdated = function (err, updatedWorktyInstanceProperty) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                worktyInstance.updateProperty(updatedWorktyInstanceProperty);
            }
        };

        if (!data.skipDbOperation) {
            var property = data.workflow.worktyInstance.property;
            var inputData = {
                id: data.workflow.id,
                propertyId: property.id,
                accountId: _id,
                name: property.name,
                value: property.value
            };

            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }

            db.updateWorktyInstanceProperty(inputData, onWorktyInstancePropertyUpdated);
        } else {
            onWorktyInstancePropertyUpdated(null, data.workflow.worktyInstance.property);
        }
    }

    function _destroy() {
        if (_refreshTimer) {
            clearInterval(_refreshTimer);
        }

        _.forEach(_workflows, function _onEachWorkflow(workflow) {
            _freeWorkerDevice(workflow);
            workflow.destroy();
        });

        _detachAllSockets();
    }

    function _isOperationAllowed(data, cb) {
        db.isPermissionAllowed(data, cb);
    }

    function _hasAdminRole(data, cb) {
        db.hasAccountAdminRole(data, cb);
    }

    function _validateInputParameters(data, properties) {
        if (!data) {
            return errorSupervisorController.createBadDigestError({inputParameters: data});
        }

        var fn = function(objects) {
            var fullNames = [];

            _.forEach(objects, function(object) {
                if (_.isString(object)) {
                    fullNames.push(object);
                } else if (_.isObject(object)) {
                    var objectKeys = _.keys(object);
                    _.forEach(objectKeys, function(key) {
                        var names = fn(_.isArray(object[key]) ? object[key]: [object[key]]);
                        _.forEach(names, function(name) {
                           fullNames.push(key + '.' + name);
                        });
                    });
                }
            });

            return fullNames;
        };

        var fullPropertyNames = fn(properties);

        if (_.isEmpty(data) && fullPropertyNames.length > 0) {
            return errorSupervisorController.createBadDigestError({inputParameters: data});
        }

        var found = true;
        _.forEach(fullPropertyNames, function(fullPropertyName) {
            var splittedNames = fullPropertyName.split('.');
            if (splittedNames.length === 0) {
                if (!data[fullPropertyName]) {
                    found = false;
                    return false;
                }
            } else {
                var newObject = data;
                _.forEach(splittedNames, function(splittedName) {
                    if (newObject[splittedName]) {
                        if (_.isObject(newObject[splittedName])) {
                            if (_.isEmpty(newObject[splittedName])) {
                                found = false;
                                return false;
                            }
                        }
                        newObject = newObject[splittedName];
                    } else {
                        found = false;
                        return false;
                    }
                });

                if (!found) {
                    return false;
                }
            }
        });

        if (!found) {
            return errorSupervisorController.createBadDigestError({inputParameters: data});
        }
    }

    function _attachSocket(socket) {
        var aclData = {};
        aclData.accountId = _id;
        aclData.resourceName = contextName;

        _sockets.push(socket);

        // Workflow web client API
        socket.on(protocolClient.REFRESH_ALL.name, function _onRefreshedAll(data) {
            aclData.permissionName = protocolClient.REFRESH_ALL.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    let inputData = {};
                    inputData.accountId = _id;
                    _hasAdminRole(inputData, (err, hasRole) => {
                        if (err) {
                            _error(err);
                            _contextChangedWithError(err, requestId);
                        } else {
                            data.accountId = _id;
                            data.hasAdminRole = hasRole;
                            _getAll(data, requestId);
                        }
                    });
                }
            });
        });

        socket.on(protocolClient.REFRESH.name, function _onRefreshed(data) {
            aclData.permissionName = protocolClient.REFRESH.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{ 'workflow' : [ 'id' ] }]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _getById(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.ADD.name, function _onAdded(data) {
            aclData.permissionName = protocolClient.ADD.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, ['workflow']);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _add(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.UPD.name, function _onUpdated(data) {
            aclData.permissionName = protocolClient.UPD.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{ 'workflow' : [ 'id' ] }]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _update(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.DEL.name, function _onDeleted(data) {
            aclData.permissionName = protocolClient.DEL.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{ 'workflow' : [ 'id' ] }]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _del(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.RUN.name, function _onRun(data) {
            aclData.permissionName = protocolClient.RUN.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{ 'workflow' : [ 'id' ] }]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _run(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.PAUSE.name, function _onPaused(data) {
            aclData.permissionName = protocolClient.PAUSE.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{ 'workflow' : [ 'id' ] }]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                //data.shouldReleaseDevice = true;
                                _pause(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.STOP.name, function _onStopped(data) {
            aclData.permissionName = protocolClient.STOP.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{ 'workflow' : [ 'id' ] }]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _stop(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.ADD_WORKTY_INSTANCE.name, function _onWorkflowWorktyInstanceAdded(data) {
            aclData.permissionName = protocolClient.ADD_WORKTY_INSTANCE.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [ {'workflow' : [ 'id',  'worktyInstance' ]}, { 'workty': ['id'] }]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _addWorktyInstance(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.UPD_WORKTY_INSTANCE.name, function _onWorkflowWorktyInstanceUpdated(data) {
            aclData.permissionName = protocolClient.UPD_WORKTY_INSTANCE.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{'workflow' : [ 'id',  { 'worktyInstance': [ 'id' ]}]}]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _updateWorktyInstance(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.DEL_WORKTY_INSTANCE.name, function _onWorkflowWorktyInstanceDeleted(data) {
            aclData.permissionName = protocolClient.DEL_WORKTY_INSTANCE.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{'workflow' : [ 'id',  { 'worktyInstance': [ 'id' ]}]}]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _delWorktyInstance(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.UPD_WORKTY_INSTANCE_PROPERTY.name, function _onWorkflowWorktyInstancePropertyUpdated(data) {
            aclData.permissionName = protocolClient.UPD_WORKTY_INSTANCE_PROPERTY.permissionName;
            _isOperationAllowed(aclData, function _onOperationAllowed(err, allowedPermissions) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{'workflow' : ['id', { 'worktyInstance': [ 'id', { 'property': ['id'] } ] }]}]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
                        let inputData = {};
                        inputData.accountId = _id;
                        _hasAdminRole(inputData, (err, hasRole) => {
                            if (err) {
                                _error(err);
                                _contextChangedWithError(err, requestId);
                            } else {
                                data.accountId = _id;
                                data.hasAdminRole = hasRole;
                                _updateWorktyInstanceProperty(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on('error', function _onError(data) {
            _error(' error ' + data);
            _detachSocket(socket);
        });

        socket.on('disconnect', function _onDisconnected(data) {
            _debug(' disconnected ' + data);
            _detachSocket(socket);
        });

        socket.emit(protocolClient.INITIALIZED, { });
    }

    function _detachAllSockets() {
        _sockets.forEach(function(socket) {
            _detachSocket(socket);
        });
    }

    function _detachSocket(socket) {
        var detachedSocket = _.find(_sockets, socket);
        if (detachedSocket) {
            if (detachedSocket.connected) {
                detachedSocket.disconnect();
            }
            _sockets = _.without(_sockets, detachedSocket);
        }
    }

    return {
        getId: function() {
            return _id;
        },
        getName: function() {
            return contextName;
        },
        attachSocket: _attachSocket,
        detachSocket: _detachSocket,
        add: _add,
        update: _update,
        del: _del,
        run: _run,
        pause: _pause,
        stop: _stop,
        addWorktyInstance: _addWorktyInstance,
        updateWorktyInstance: _updateWorktyInstance,
        delWorktyInstance: _delWorktyInstance,
        updateWorktyInstanceProperty: _updateWorktyInstanceProperty,
        destroy:_destroy
    };
};

module.exports = WorkflowsContext;