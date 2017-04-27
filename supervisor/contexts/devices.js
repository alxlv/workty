'use strict';
/**
 * Created by Alex Levshin on 22/1/16.
 */
require('log-timestamp');
var _ = require('lodash');
var config = rootRequire('config');
var util = require('util');
var socketIOClient = require('socket.io-client');
var latestVersion = config.restapi.getLatestVersion();
var ApiPrefix = 'api/v' + latestVersion.major + '/';
var protocolWorker = rootRequire('shared/protocols/v' + latestVersion.major + '/worker-sv.module').OPERATIONS;
var protocolClient = rootRequire('shared/protocols/v' + latestVersion.major + '/client-sv-devices.module').OPERATIONS;
var db = rootRequire('database/db').getInstance(config.supervisor.name);
var errorSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/error-controller')();
var LoggerController = rootRequire('shared/controllers/logger-controller')();
var Q = require('q');

var DevicesContext = function CreateDevicesContext(contextOwner, contextName, contextLocator) {
    var _devices = [];
    var _sockets = [];
    var _refreshTimer = null;
    var _id = contextOwner.id;
    var _refreshingActive = false;

    // Attach refreshing handler
    _refreshTimer = setInterval(_refreshDisconnectedDevices, db.findContextByName(contextName).refreshingTimeout);

    // Load all devices
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

    function _addDevice(data, requestId) {
        var device = data.device;
        var newDevice = {};

        // Update from db data
        newDevice.id = device._id.toString();
        newDevice.state = device.stateId.name;
        newDevice.name = device.name;
        newDevice.socket = null;
        newDevice.port = device.port;
        newDevice.protocol = device.protocol;
        newDevice.ipAddress = device.ip4Address || device.ip6Address;
        newDevice.platform = {};

        _devices.push(newDevice);

        _contextChangedNoError({device: newDevice}, requestId);

        return newDevice;
    }

    function _updateDevice(data, requestId) {
        var device = data.device;
        var existingDevice = _.find(_devices, {id: device._id.toString()});

        if (existingDevice) {
            // Update from db data
            existingDevice.state = device.stateId.name;
            existingDevice.name = device.name;
            existingDevice.port = device.port;
            existingDevice.protocol = device.protocol;
            existingDevice.ipAddress = device.ip4Address || device.ip6Address;
            if (data.platform) {
                existingDevice.platform = data.platform;
            }

            _contextChangedNoError({device: existingDevice}, requestId);
        }

        return existingDevice;
    }

    function _delDevice(data, requestId) {
        var device = _.find(_devices, {id: data.device.id});
        if (device) {
            _devices = _.without(_devices, device);
            var result = {id: device.id, deleted: true};
            _contextChangedNoError({device: result}, requestId);
        }
    }

    function _getAll(data, requestId) {
        var inputData = data || {};
        inputData.embed = 'state';
        db.getAllDevices(inputData, function _onDevicesReturned(err, devices) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _devices = [];
                if (devices.length === 0) {
                    _contextChangedNoError({device: {}}, requestId);
                } else {
                    _.forEach(devices, function _onEachDevice(device) {
                        var inputData = {device: device};
                        inputData.device = _addDevice(inputData, requestId);
                        _refreshDevice(inputData, requestId);
                    });
                }
            }
        });
    }

    function _getById(data, requestId) {
        var device = _.find(_devices, {id: data.device.id});

        if (!device) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var inputData = {id: device.id, embed: 'state'};
        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        if (_.has(data, 'accountId')) {
            inputData.accountId = data.accountId;
        }
        db.getDeviceById(inputData, function _onDeviceReturned(err, device) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {device: device};
                inputData.device = _addDevice(inputData, requestId);
                _refreshDevice(inputData, requestId);
            }
        });
    }

    function _add(data, requestId) {
        var inputData = data.device;
        inputData.embed = 'state';
        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        if (_.has(data, 'accountId')) {
            inputData.accountId = data.accountId;
        }
        db.addDevice(inputData, function _onDeviceAdded(err, newDevice) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {device: newDevice};
                _addDevice(inputData, requestId);
            }
        });
    }

    function _update(data, requestId) {
        var device = _.find(_devices, {id: data.device.id});

        if (!device) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var inputData = data.device;
        inputData.embed = 'state';
        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        if (_.has(data, 'accountId')) {
            inputData.accountId = data.accountId;
        }
        db.updateDevice(inputData, function _onDeviceUpdated(err, updatedDevice) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {device: updatedDevice};
                _updateDevice(inputData, requestId);
            }
        });
    }

    function _del(data, requestId) {
        var device = _.find(_devices, {id: data.device.id});
        if (device) {
            var inputData = {id: device.id};
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            if (_.has(data, 'accountId')) {
                inputData.accountId = data.accountId;
            }
            db.delDevice(inputData, function _onDeviceDeleted(err, deletedDevice) {
                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputData = {device: deletedDevice};
                    _delDevice(inputData, requestId);
                }
            });
        }
    }

    function _connectSocket(data, requestId) {
        var device = _.find(_devices, {id: data.device.id});

        if (!device) {
            return Q.reject(data);
        }

        if (device.socket !== null) {
            return Q.resolve(device.socket);
        }

        return new Q.Promise(function (resolve, reject, notify) {
            var connectionString = device.protocol + '://' + device.ipAddress + ':' + device.port;
            var socket = socketIOClient(connectionString, {forceNew: true, reconnection: false, transports: ['websocket']});
            socket.on('connect', function _onClientConnect() {
                socket.on('reconnect_attempt',  function _onClientReconnectAttempt(attempt) {
                    _debug('Reconnect attempt: ' + attempt);
                });

                socket.on('reconnect_error', function _onClientReconnectedError(err) {
                    _error('Reconnect error: ' + util.inspect(err));
                });

                socket.on('connect_error', function _onClientConnectedError(err) {
                    _error('Connect error: ' + util.inspect(err));
                    var inputData = {
                        device: {id: device.id}
                    };
                    _disconnect(inputData, requestId);
                });

                socket.on('error', function _onClientError(err) {
                   _error('Error: ' + util.inspect(err));
                    var inputData = {
                        device: {id: device.id}
                    };
                    _disconnect(inputData, requestId);
                });

                socket.on('disconnect', function _onClientDisconnected(data) {
                    _error('Disconnected: ' + util.inspect(data));
                    var inputData = {
                        device: {id: device.id}
                    };
                    _disconnect(inputData, requestId);
                });

                resolve(socket);
            });
        });
    }

    function _disconnect(data, requestId) {
        // Disconnect socket and remove all listeners
        _freeSocket(data.device.id);

        // Set device to disconnected state
        var inputData = {device: {id: data.device.id, state: 'disconnected'}};
        _update(inputData, requestId);
    }

    function _freeSocket(deviceId) {
        var device = _.find(_devices, {id: deviceId});
        if (device) {
            if (device.socket !== null) {
                _debug('Free socket for ' + deviceId);
                device.socket.removeAllListeners();
                device.socket.disconnect();
                device.socket = null;
            }
        }
    }

    function _getConfiguration(socket) {
        return new Q.Promise(function (resolve, reject, notify) {
            var _onDeviceSentConfiguration = function (result) {
                // Unsubscribe on event
                socket.removeListener(protocolWorker.SEND_CONFIGURATION, _onDeviceSentConfiguration);
                if (result.err) {
                    reject(new Error(result.err));
                } else {
                    resolve(result);
                }
            };

            socket.on(protocolWorker.SEND_CONFIGURATION, _onDeviceSentConfiguration);
            socket.emit(protocolWorker.GET_CONFIGURATION);
        });
    }

    function _refreshDevice(data, requestId) {
        return new Q.Promise(function (resolve, reject, notify) {
            var inputData = {device: data.device};
            var connectionString = data.device.ipAddress + ':' + data.device.port;
            _debug('Heartbeat ' + connectionString);

             _connectSocket(inputData, requestId)
            .then(function _onSuccess(socket) {
                return _getConfiguration(socket);
            })
            .then(function _onSuccess(result) {
                var inputData = {id: data.device.id};
                if (data.newState) {
                    inputData.state = data.newState;
                    inputData.embed = 'state';
                    db.updateDevice(inputData, function _onDeviceUpdated(err, updatedDevice) {
                        if (err) {
                            _error(err);
                            _contextChangedWithError(err, requestId);
                            reject(new Error(err));
                        } else {
                            var inputData = {device: updatedDevice, platform: result};
                            resolve(data.device);
                            _updateDevice(inputData, requestId);
                        }
                    });
                } else {
                    data.device.platform = result;
                    _contextChangedNoError({device: data.device}, requestId);
                    resolve(data.device);
                }
            }, function _onFailure(err) {
                _error(err);
                _contextChangedWithError(err, requestId);
                reject(new Error(err));
            });
        });
    }

    function _refreshDisconnectedDevices() {
        if (_refreshingActive) {
            return;
        }

        var promises = _.filter(_devices, function _onEachDevice(device) {
            if (device.state === 'disconnected') {
                var inputData = {device: device, newState: 'waiting'};
                return _refreshDevice(inputData);
            }
        });

        //_debug('Disconnected devices ' + promises.length);

        if (promises.length > 0) {
            _refreshingActive = true;

            Q.allSettled(promises).then(function _onSuccess(results) {
                _refreshingActive = false;
            })
            .catch(function _onFailure(err) {
                _error(err);
                _refreshingActive = false;
            });
        }
    }

    function _executeCode(data, cb) {
        var device = _.find(_devices, {id: data.device.id});

        // Connect to device
        var inputData = {};
        inputData.device = device;
        inputData.cb = cb;
        _connectSocket(inputData).then(function _onSuccess(socket) {
            var _onCodeExecuted = function (result) {
                socket.removeListener(protocolWorker.COMPLETED, _onCodeExecuted);
                if (result.err) {
                    _error(result.err);
                    _contextChangedWithError(result.err);
                    cb(result.err);
                } else {
                    cb(null, result);
                }
            };

            // Subscribe on completing event
            socket.on(protocolWorker.COMPLETED, _onCodeExecuted);

            if (device.socket === null) {
                // Save socket for device
                device.socket = socket;
            }

            var connectionString = device.ipAddress + ':' + device.port;
            _debug('Execute ' +  data.workerProperties.worktyInstanceProperties.id + ' on ' + connectionString);

            // Send data to worker
            socket.emit(protocolWorker.EXECUTE, data.workerProperties);
        }, function _onFailure(err) {
            _error(err);
            cb(err);
        });
    }

    function _borrow(data, cb) {
        // Find free worker device in pool and use it
        db.borrowDevice(data, function _onDeviceBorrowed(err, borrowedDevice) {
            if (err) {
                //_error(err);
                cb(err);
            } else {
                _debug('Borrow device: ' + borrowedDevice.ip4Address + ':' + borrowedDevice.port);
                var inputData = {device: borrowedDevice};
                var device = _updateDevice(inputData);
                cb(null, device);
            }
        });
    }

    function _release(data, cb) {
        // Return worker device back to pool
        db.returnDevice(data, function _onDeviceReturned(err, releasedDevice) {
            if (err) { _error(err); cb(err); }
            else {
                _debug('Release device: ' + releasedDevice.ip4Address + ':' + releasedDevice.port);
                var inputData = {device: releasedDevice};
                var device = _updateDevice(inputData);
                cb(null, device);
            }
        });
    }

    function _destroy() {
        if (_refreshTimer) {
            clearInterval(_refreshTimer);
        }
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

        // Device web client API
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
                            // TODO: Do not need to pass accountId for devices
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
                    var inputParametersError = _validateInputParameters(data, [{'device': ['id']}]);
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
                    var inputParametersError = _validateInputParameters(data, ['device']);
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
                    var inputParametersError = _validateInputParameters(data, [{'device': ['id']}]);
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
                    var inputParametersError = _validateInputParameters(data, [{'device': ['id']}]);
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
        freeSocket: _freeSocket,
        borrow: _borrow,
        release: _release,
        executeCode: _executeCode,
        attachSocket: _attachSocket,
        detachSocket: _detachSocket,
        destroy: _destroy
    };
};

module.exports = DevicesContext;