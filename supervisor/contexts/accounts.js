'use strict';
/**
 * Created by pimaster on 1/22/15.
 */
require('log-timestamp');
var _ = require('lodash');
var config = rootRequire('config');
var util = require('util');
var latestVersion = config.restapi.getLatestVersion();
var ApiPrefix = 'api/v' + latestVersion.major + '/';
var db = rootRequire('database/db').getInstance(config.supervisor.name);
var errorSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/error-controller')();
var protocolClient = rootRequire('shared/protocols/v' + latestVersion.major  + '/client-sv-accounts.module').OPERATIONS;
var LoggerController = rootRequire('shared/controllers/logger-controller')();

var AccountsContext = function CreateAccountsContext(contextOwner, contextName, contextLocator) {
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

    function _addAccount(data, requestId) {
        var account = data.account;
        var newAccount = {};

        // Update from db data
        newAccount.id = account._id.toString();
        newAccount.name = account.name;
        newAccount.oauthID = account.oauthID;
        newAccount.email = account.email;
        newAccount.acl = account.acl;
        newAccount.amount = account.amount;
        newAccount.removed = account.removed;
        newAccount.removedDate = account.removedDate;

        _contextChangedNoError({account: newAccount}, requestId);

        return newAccount;
    }

    function _updateAccount(data, requestId) {
        var account = data.account;

        var existingAccount = {};
        existingAccount.id = account._id.toString();
        existingAccount.name = account.name;
        existingAccount.oauthID = account.oauthID;
        existingAccount.email = account.email;
        existingAccount.acl = account.acl;
        existingAccount.amount = account.amount;
        existingAccount.removed = account.removed;
        existingAccount.removedDate = account.removedDate;

        _contextChangedNoError({account: existingAccount}, requestId);

        return existingAccount;
    }

    function _delAccount(data, requestId) {
        var result = {id: data.id, deleted: true};
        _contextChangedNoError({account: result}, requestId);
    }

    function _getAll(data, requestId) {
        var inputData = data || {};
        db.getAllAccounts(inputData, function _onAccountsReturned(err, accounts) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _.forEach(accounts, function _onEachAccount(account) {
                    var inputData = {account: account};
                    _addAccount(inputData, requestId);
                });
            }
        });
    }

    function _getById(data, requestId) {
        // data.account._id received from rest api, data.account.id from web socket users
        // at this moment rest api getbyid() is not provided
        var id = data.account.id || data.account._id;

        var inputData = {id: id};
        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        if (_.has(data, 'accountId')) {
            inputData.accountId = data.accountId;
        }
        db.getAccountById(inputData, function _onAccountReturned(err, account) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {account: account};
                _addAccount(inputData, requestId);
            }
        });
    }

    function _add(data, requestId) {
        var onAccountAdded = function(err, addedAccount) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _debug('Adding account ' + addedAccount._id);

                var inputData = {account: addedAccount};
                _addAccount(inputData, requestId);
                // Update owner (account acl) for all client context
                contextLocator.upsertRootContext({account: addedAccount, added: true});
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.account;
            inputData.accountId = _id;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            db.addAccount(inputData, onAccountAdded);
        } else {
            onAccountAdded(null, data.account);
        }
    }

    function _update(data, requestId) {
        // data.account._id received from rest api, data.account.id from web socket users
        var id = data.account.id || data.account._id;

        var onAccountUpdated = function (err, updatedAccount) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {account: updatedAccount};
                _updateAccount(inputData, requestId);
                // Update owner (account acl) for all client context
                contextLocator.upsertRootContext(inputData);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.account;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            if (_.has(data, 'accountId')) {
                inputData.accountId = data.accountId;
            }
            db.updateAccount(inputData, onAccountUpdated);
        } else {
            onAccountUpdated(null, data.account);
        }
    }

    function _del(data, requestId) {
        // data.account._id received from rest api, data.account.id from web socket users
        var onAccountDeleted = function (err, deletedAccount) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _debug('Deleting account ' + deletedAccount._id);

                var inputData = {id: deletedAccount._id.toString()};
                _delAccount(inputData, requestId);
                // Update owner (account acl) for all client context
                contextLocator.upsertRootContext({account: deletedAccount, deleted: true});
            }
        };

        if (!data.skipDbOperation) {
            var inputData = {id: account.id};
            if (data.account.removing) {
                inputData.removing = data.account.removing;
            }
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            if (_.has(data, 'accountId')) {
                inputData.accountId = data.accountId;
            }
            db.delAccount(inputData, onAccountDeleted);
        } else {
            onAccountDeleted(null, data.account);
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

        // Account web client API
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
                    var inputParametersError = _validateInputParameters(data, [{'account': ['id']}]);
                    if (inputParametersError) {
                        _error(err);
                        _contextChangedWithError(inputParametersError, requestId);
                    } else {
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
                                    _getById(data, requestId);
                                }
                            });
                        }
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
                    var inputParametersError = _validateInputParameters(data, ['account']);
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
                    var inputParametersError = _validateInputParameters(data, [{'account': ['id']}]);
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
                    var inputParametersError = _validateInputParameters(data, [{'account': ['id']}]);
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
        destroy: _destroy
    };
};

module.exports = AccountsContext;