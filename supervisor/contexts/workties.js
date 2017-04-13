'use strict';
/**
 * Created by Alex Levshin on 22/1/16.
 */
require('log-timestamp');
var _ = require('lodash');
var config = rootRequire('config');
var util = require('util');
var latestVersion = config.restapi.getLatestVersion();
var ApiPrefix = 'api/v' + latestVersion.major + '/';
var db = rootRequire('database/db').getInstance(config.supervisor.name);
var errorSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/error-controller')();
var protocolClient = rootRequire('shared/protocols/v' + latestVersion.major + '/client-sv-workties.module').OPERATIONS;
var LoggerController = rootRequire('api/shared-controllers/logger-controller')();

var WorktiesContext = function CreateWorktiesContext(contextOwner, contextName, contextLocator) {
    var _workties = [];
    var _sockets = [];
    var _id = contextOwner.id;

    var _accountsContext = null;

    function _getAccountsContext() {
        if (!_accountsContext) {
            _accountsContext = contextLocator.get(_id, 'accounts');
        }
        return _accountsContext;
    }

    // Load workties
    _getAll();

    function _error(data) {
        var msg = '[' + _id + '] [' + contextName + ' context] ' + util.inspect(data, {depth: null});
        console.error(msg);
        LoggerController.error(msg);
    }

    function _debug(data) {
        var msg = '[' + _id + '] [' + contextName + ' context] ' + util.inspect(data, {depth: null});
        console.log(msg);
        LoggerController.debug(msg);
    }

    function _contextChanged(data) {
        // Send data to all connected clients
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

    function _replaceId(obj) {
        var modifiedValue = {};
        if (obj._id) {
            _.forOwn(obj._doc, function(n, key) {
                if (key === '_id') {
                    modifiedValue.id = n;
                } else {
                    modifiedValue[key] = n;
                }
            });

            return modifiedValue;
        } else {
            return obj;
        }
    }

    function _addWorkty(data, requestId) {
        var workty = data.workty;
        var newWorkty = {};

        // Update from db data
        newWorkty.id = workty._id.toString();
        newWorkty.name = workty.name;
        newWorkty.desc = workty.desc;
        newWorkty.typeId  = _replaceId(workty.typeId);
        newWorkty.categoryId = _replaceId(workty.categoryId);
        newWorkty.languageTypeId = _replaceId(workty.languageTypeId);
        newWorkty.validationStateId = _replaceId(workty.validationStateId);
        newWorkty.entryPointModuleFileName = workty.entryPointModuleFileName;
        newWorkty.price = workty.price;
        newWorkty.discountPercent = workty.discountPercent;
        newWorkty.propertiesIds = [];
        _.forEach(workty.propertiesIds, function _onEachWorktyProperty(worktyProperty) {
            newWorkty.propertiesIds.push({
                id: worktyProperty._id.toString(),
                name: worktyProperty.name,
                value: worktyProperty.value
            });
        });

        _workties.push(newWorkty);

        _contextChangedNoError({workty: newWorkty}, requestId);

        return newWorkty;
    }

    function _updateWorkty(data, requestId) {
        var workty = data.workty;
        var existingWorkty = _.find(_workties, {id: workty._id.toString()});

        if (existingWorkty) {
            // Update from db data
            existingWorkty.name = workty.name;
            existingWorkty.desc = workty.desc;
            existingWorkty.typeId = _replaceId(workty.typeId);
            existingWorkty.categoryId = _replaceId(workty.categoryId);
            existingWorkty.languageTypeId = _replaceId(workty.languageTypeId);
            existingWorkty.entryPointModuleFileName = workty.entryPointModuleFileName;
            existingWorkty.price = workty.price;
            existingWorkty.discountPercent = workty.discountPercent;
            existingWorkty.propertiesIds = [];
            _.forEach(workty.propertiesIds, function _onEachWorktyProperty(worktyProperty) {
                existingWorkty.propertiesIds.push({
                    id: worktyProperty._id.toString(),
                    name: worktyProperty.name,
                    value: worktyProperty.value
                });
            });
            _contextChangedNoError({workty: existingWorkty}, requestId);
        }

        return existingWorkty;
    }

    function _delWorkty(data, requestId) {
        var workty = _.find(_workties, {id: data.id});
        if (workty) {
            _workties = _.without(_workties, workty);
            var result = {id: workty.id, deleted: true};
            _contextChangedNoError({workty: result}, requestId);
        }
    }

    function _getAll(data, requestId) {
        var inputData = data || {};
        inputData.accountId = _id;
        inputData.embed = 'properties, type, category, languageType, validationState';
        db.getAllWorkties(inputData, function _onWorktiesReturned(err, workties) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _workties = [];
                if (workties.length === 0) {
                    _contextChangedNoError({workty: {}}, requestId);
                } else {
                    _.forEach(workties, function _onEachWorkty(workty) {
                        var inputData = {workty: workty};
                        _addWorkty(inputData, requestId);
                    });
                }
            }
        });
    }

    function _getById(data, requestId) {
        // data.workty._id received from rest api, data.workty.id from web socket users
        var id = data.workty.id || data.workty._id;
        var workty = _.find(_workties, {id: id});

        if (!workty) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var inputData = {accountId: _id, id: workty.id, embed: 'properties, type, category, languageType, validationState'};
        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        db.getWorktyById(inputData, function _onWorktyReturned(err, workty) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {workty: workty};
                _updateWorkty(inputData, requestId);
            }
        });
    }

    function _add(data, requestId) {
        var onWorktyAdded = function(err, addedWorkty) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _addWorkty({workty: addedWorkty}, requestId);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.workty;
            inputData.accountId = _id;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            db.addWorkty(inputData, onWorktyAdded);
        } else {
            onWorktyAdded(null, data.workty);
        }
    }

    function _update(data, requestId) {
        var id = data.workty.id || data.workty._id;
        var workty = _.find(_workties, {id: id});

        if (!workty) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}, requestId));
            return;
        }

        var onWorktyUpdated = function (err, updatedWorkty) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _updateWorkty({workty: updatedWorkty}, requestId);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.workty;
            inputData.accountId = _id;
            inputData.embed = 'properties, type, category, languageType';
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            db.updateWorkty(inputData, onWorktyUpdated);
        } else {
            onWorktyUpdated(null, data.workty);
        }
    }

    function _del(data, requestId) {
        var id = data.workty.id || data.workty._id;
        var workty = _.find(_workties, {id: id});
        if (workty) {
            var onWorktyDeleted = function (err, deletedWorkty) {
                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputData = {id: deletedWorkty._id.toString()};
                    _delWorkty(inputData, requestId);
                }
            };

            if (!data.skipDbOperation) {
                var inputData = {accountId: _id, id: workty.id};
                if (_.has(data, 'hasAdminRole')) {
                    inputData.hasAdminRole = data.hasAdminRole;
                }
                db.delWorkty(inputData, onWorktyDeleted);
            } else {
                onWorktyDeleted(null, data.workty);
            }
        }
    }

    function _getAllProperties(data, requestId) {
        var id = data.workty.id || data.workty._id;
        var workty = _.find(_workties, {id: id});

        if (!workty) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}, requestId));
            return;
        }

        var inputData = data.workty;
        inputData.accountId = _id;
        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        db.getAllWorktyProperties(inputData, function _onWorktyPropertiesReturned(err, worktyProperties) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                workty.propertiesIds = [];
                _.forEach(worktyProperties, function _onEachWorktyProperty(worktyProperty) {
                    workty.propertiesIds.push({
                        id: worktyProperty._id.toString(),
                        name: worktyProperty.name,
                        value: worktyProperty.value
                    });
                });
                _contextChangedNoError({workty: workty}, requestId);
            }
        });
    }

    function _addProperty(data, requestId) {
        var id = data.workty.id || data.workty._id;
        var workty = _.find(_workties, {id: id});

        if (!workty) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var onWorktyPropertyAdded = function(err, addedWorktyProperty) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                workty.propertiesIds.push({
                    id: addedWorktyProperty._id.toString(),
                    name: addedWorktyProperty.name,
                    value: addedWorktyProperty.value
                });
                _contextChangedNoError({workty: workty}, requestId);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.workty;
            inputData.accountId = _id;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            db.addWorktyProperty(inputData, onWorktyPropertyAdded);
        } else {
            onWorktyPropertyAdded(null, data.workty.property);
        }
    }

    function _updateProperty(data, requestId) {
        var id = data.workty.id || data.workty._id;
        var workty = _.find(_workties, {id: id});

        if (!workty) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var onWorktyPropertyUpdated = function (err, updatedWorktyProperty) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var worktyProperty = _.find(workty.propertiesIds, {id: updatedWorktyProperty._id.toString()});
                if (worktyProperty) {
                    worktyProperty.name = updatedWorktyProperty.name;
                    worktyProperty.value = updatedWorktyProperty.value;
                    _contextChangedNoError({workty: workty}, requestId);
                }
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.workty;
            inputData.accountId = _id;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            db.updateWorktyProperty(inputData, onWorktyPropertyUpdated);
        } else {
            onWorktyPropertyUpdated(null, data.workty.property);
        }
    }

    function _delProperty(data, requestId) {
        var id = data.workty.id || data.workty._id;
        var workty = _.find(_workties, {id: id});
        if (workty) {
            var onWorktyPropertyDeleted = function (err, deletedWorktyProperty) {
                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var worktyProperty = _.find(workty.propertiesIds, {id: deletedWorktyProperty._id.toString()});
                    if (worktyProperty) {
                        workty.propertiesIds = _.without(workty.propertiesIds, worktyProperty);
                        _contextChangedNoError({workty: workty}, requestId);
                    }
                }
            };

            if (!data.skipDbOperation) {
                var inputData = data.workty;
                inputData.accountId = _id;
                if (_.has(data, 'hasAdminRole')) {
                    inputData.hasAdminRole = data.hasAdminRole;
                }
                db.delWorktyProperty(inputData, onWorktyPropertyDeleted);
            } else {
                onWorktyPropertyDeleted(null, data.workty.property);
            }
        }
    }

    function _destroy() {
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

        // Workties web client API
        socket.on(protocolClient.REFRESH_ALL.name, function _onRefreshed(data) {
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

        socket.on(protocolClient.REFRESH_CATEGORIES_ALL.name, function _onRefreshed(data) {
            aclData.permissionName = protocolClient.REFRESH_CATEGORIES_ALL.permissionName;
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
                    var inputData = {name: 'categories'};
                    _getDictionary(inputData, function _onDictionaryReceived(err, categories) {
                        if (err) {
                            _error(err);
                            _contextChangedWithError(err, requestId);
                        } else {
                            _contextChangedNoError({categories: categories}, requestId);
                        }
                    });
                }
            });
        });

        socket.on(protocolClient.REFRESH_LANGUAGE_TYPES_ALL.name, function _onRefreshed(data) {
            aclData.permissionName = protocolClient.REFRESH_LANGUAGE_TYPES_ALL.permissionName;
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
                    var inputData = {name: 'language-types'};
                    _getDictionary(inputData, function _onDictionaryReceived(err, languageTypes) {
                        if (err) {
                            _error(err);
                            _contextChangedWithError(err, requestId);
                        } else {
                            _contextChangedNoError({languageTypes: languageTypes}, requestId);
                        }
                    });
                }
            });
        });

        socket.on(protocolClient.REFRESH_TYPES_ALL.name, function _onRefreshed(data) {
            aclData.permissionName = protocolClient.REFRESH_TYPES_ALL.permissionName;
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
                    var inputData = {name: 'types'};
                    _getDictionary(inputData, function _onDictionaryReceived(err, types) {
                        if (err) {
                            _error(err);
                            _contextChangedWithError(err, requestId);
                        } else {
                            _contextChangedNoError({types: types}, requestId);
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
                    var inputParametersError = _validateInputParameters(data, [{'workty': ['id']}]);
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
                    var inputParametersError = _validateInputParameters(data, ['workty']);
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
            _isOperationAllowed(aclData, function _onPermissionsAllowed(err) {
                var requestId;
                if (data && data.requestId) {
                    requestId = data.requestId;
                    delete data.requestId;
                }

                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputParametersError = _validateInputParameters(data, [{'workty': ['id']}]);
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
                    var inputParametersError = _validateInputParameters(data, [{'workty': ['id']}]);
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

        socket.on(protocolClient.REFRESH_ALL_PROPERTIES.name, function _onWorktyPropertiesRefreshed(data) {
            aclData.permissionName = protocolClient.REFRESH_ALL_PROPERTIES.permissionName;
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
                    var inputParametersError = _validateInputParameters(data, [{'workty' : ['id']}]);
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
                                _getAllProperties(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.ADD_PROPERTY.name, function _onWorktyPropertyAdded(data) {
            aclData.permissionName = protocolClient.ADD_PROPERTY.permissionName;
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
                    var inputParametersError = _validateInputParameters(data, [{'workty' : ['id', 'property']}]);
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
                                _addProperty(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.UPD_PROPERTY.name, function _onWorktyPropertyUpdated(data) {
            aclData.permissionName = protocolClient.UPD_PROPERTY.permissionName;
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
                    var inputParametersError = _validateInputParameters(data, [{'workty' : ['id', {'property': ['id']}]}]);
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
                                _updateProperty(data, requestId);
                            }
                        });
                    }
                }
            });
        });

        socket.on(protocolClient.DEL_PROPERTY.name, function _onWorktyPropertyDeleted(data) {
            aclData.permissionName = protocolClient.DEL_PROPERTY.permissionName;
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
                    var inputParametersError = _validateInputParameters(data, [{'workty' : ['id', {'property': ['id']}]}]);
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
                                _delProperty(data, requestId);
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

        socket.emit(protocolClient.INITIALIZED, {});
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
        getAll: function() {
            return _workties;
        },
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
        addProperty: _addProperty,
        updateProperty: _updateProperty,
        delProperty: _delProperty,
        destroy: _destroy
    };
};

module.exports = WorktiesContext;