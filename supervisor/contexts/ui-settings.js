'use strict';
/**
 * Created by Alex Levshin on 22/1/16.
 */
require('log-timestamp');
var _ = require('lodash');
var config = rootRequire('config');
var util = require('util');
var latestVersion = config.restapi.getLatestVersion();
var db = rootRequire('database/db').getInstance(config.supervisor.name);
var protocolClient = rootRequire('shared/protocols/v' + latestVersion.major  + '/client-sv-ui-settings.module').OPERATIONS;
var LoggerController = rootRequire('api/shared-controllers/logger-controller')();

var UiSettingsContext = function CreateUiSettingssContext(contextOwner, contextName, contextLocator) {
    var _sockets = [];
    var _id = contextOwner.id;

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

    function _loadWorkflow(data, requestId) {
        var inputData = {};
        _.assign(inputData, data);
        inputData.accountId = _id;
        db.loadWorkflowUiSettings(inputData, function _onUiSettingsLoaded(err, workflowUiSettings) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {uiSettings: workflowUiSettings};
                _contextChangedNoError(inputData, requestId);
            }
        });
    }

    function _saveWorkflow(data, requestId) {
        var inputData = {};
        _.assign(inputData, data);
        inputData.accountId = _id;
        db.saveWorkflowUiSettings(inputData, function _onUiSettingsSaved(err, workflowUiSettings) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {uiSettings: workflowUiSettings};
                _contextChangedNoError(inputData, requestId);
            }
        });
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

    function _attachSocket(socket) {
        var aclData = {};
        aclData.accountId = _id;
        aclData.resourceName = contextName;

        _sockets.push(socket);

        // Account web client API
        socket.on(protocolClient.LOAD_WORKFLOW.name, function _onLoadedWorkflow(data) {
            aclData.permissionName = protocolClient.LOAD_WORKFLOW.permissionName;
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
                            _loadWorkflow(data, requestId);
                        }
                    });
                }
            });
        });

        socket.on(protocolClient.SAVE_WORKFLOW.name, function _onSavedWorkflow(data) {
            aclData.permissionName = protocolClient.SAVE_WORKFLOW.permissionName;
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
                            _saveWorkflow(data, requestId);
                        }
                    });
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
        _sockets.forEach((socket) => {
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
        loadWorkflow: _loadWorkflow,
        saveWorkflow: _saveWorkflow,
        destroy: _destroy
    };
};

module.exports = UiSettingsContext;