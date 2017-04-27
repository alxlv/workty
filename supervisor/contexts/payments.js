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
var protocolClient = rootRequire('shared/protocols/v' + latestVersion.major  + '/client-sv-payments.module').OPERATIONS;
var LoggerController = rootRequire('shared/controllers/logger-controller')();

var PaymentsContext = function CreatePaymentsContext(contextOwner, contextName, contextLocator) {
    var _paymentTransactions = [];
    var _sockets = [];
    var _worktiesContext = null;
    var _id = contextOwner.id;

    function _getWorktiesContext() {
        if (!_worktiesContext) {
            _worktiesContext = contextLocator.get(_id, 'workties');
        }
        return _worktiesContext;
    }

    // Load payments transactions
    //_getAll();

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

    function _addPaymentTransaction(data, requestId) {
        var paymentTransaction = data.paymentTransaction;
        var newPaymentTransaction = {};

        // Update from db data
        newPaymentTransaction.id = paymentTransaction._id.toString();
        newPaymentTransaction.worktyId = paymentTransaction.worktyId.toString();
        newPaymentTransaction.msg = paymentTransaction.msg;
        newPaymentTransaction.created = paymentTransaction.created;
        newPaymentTransaction.accountId = paymentTransaction.accountId;

        _paymentTransactions.push(newPaymentTransaction);

        _contextChangedNoError({paymentTransaction: newPaymentTransaction}, requestId);

        return newPaymentTransaction;
    }

    function _updatePaymentTransaction(data, requestId) {
        var paymentTransaction = data.paymentTransaction;
        var existingPaymentTransaction = _.find(_paymentTransactions, {id: paymentTransaction._id.toString()});

        if (existingPaymentTransaction) {
            // Update from db data
            existingPaymentTransaction.msg = paymentTransaction.msg;

            _contextChangedNoError({paymentTransaction: existingPaymentTransaction}, requestId);
        }

        return existingPaymentTransaction;
    }

    function _delPaymentTransaction(data, requestId) {
        var paymentTransaction = _.find(_paymentTransactions, {id: data.id});
        if (paymentTransaction) {
            _paymentTransactions = _.without(_paymentTransactions, paymentTransaction);
            var result = {id: paymentTransaction.id, deleted: true};
            _contextChangedNoError({paymentTransaction: result}, requestId);
        }
    }

    function _getAll(data, requestId) {
        var inputData = data || {};
        inputData.accountId = _id;
        db.getAllPaymentTransactions(inputData, function _onPaymentTransactionsReturned(err, paymentTransactions) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                _paymentTransactions = [];
                if (paymentTransactions.length === 0) {
                    _contextChangedNoError({paymentTransaction: {}}, requestId);
                } else {
                    _.forEach(paymentTransactions, function _onEachPaymentTransaction(paymentTransaction) {
                        var inputData = {paymentTransaction: paymentTransaction};
                        _addPaymentTransaction(inputData, requestId);
                    });
                }
            }
        });
    }

    function _getById(data, requestId) {
        // data.paymentTransaction._id received from rest api, data.paymentTransaction.id from web socket users
        // at this moment rest api getbyid() is not provided
        var id = data.paymentTransaction.id || data.paymentTransaction._id;
        var paymentTransaction = _.find(_paymentTransactions, {id: id});

        if (!paymentTransaction) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var inputData = {accountId: _id, id: id};
        if (_.has(data, 'hasAdminRole')) {
            inputData.hasAdminRole = data.hasAdminRole;
        }
        db.getPaymentTransactionById(inputData, function _onPaymentTransactionReturned(err, paymentTransaction) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {paymentTransaction: paymentTransaction};
                _addPaymentTransaction(inputData, requestId);
            }
        });
    }

    function _add(data, requestId) {
        // result = paymentTransaction, workty
        var onPaymentTransactionAdded = function(err, result) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {paymentTransaction: result.paymentTransaction};
                _addPaymentTransaction(inputData, requestId);
                // Update workty context by new workty
                _getWorktiesContext().add({workty: result.workty, skipDbOperation: true, requestId: requestId});
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.paymentTransaction;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            if (_.has(data, 'accountId')) {
                inputData.accountId = data.accountId;
            }
            db.addPaymentTransaction(inputData, onPaymentTransactionAdded);
        } else {
            onPaymentTransactionAdded(null, data);
        }
    }

    function _update(data, requestId) {
        // data.paymentTransaction._id received from rest api, data.paymentTransaction.id from web socket users
        var id = data.paymentTransaction.id || data.paymentTransaction._id;
        var paymentTransaction = _.find(_paymentTransactions, {id: id});

        if (!paymentTransaction) {
            _contextChangedWithError(errorSupervisorController.createEntityNotFound({inputParameters: data}), requestId);
            return;
        }

        var onPaymentTransactionUpdated = function (err, updatedPaymentTransaction) {
            if (err) {
                _error(err);
                _contextChangedWithError(err, requestId);
            } else {
                var inputData = {paymentTransaction: updatedPaymentTransaction};
                _updatePaymentTransaction(inputData, requestId);
            }
        };

        if (!data.skipDbOperation) {
            var inputData = data.paymentTransaction;
            if (_.has(data, 'hasAdminRole')) {
                inputData.hasAdminRole = data.hasAdminRole;
            }
            if (_.has(data, 'accountId')) {
                inputData.accountId = data.accountId;
            }
            db.updatePaymentTransaction(inputData, onPaymentTransactionUpdated);
        } else {
            onPaymentTransactionUpdated(null, data.paymentTransaction);
        }
    }

    function _del(data, requestId) {
        // data.paymentTransaction._id received from rest api, data.paymentTransaction.id from web socket users
        var id = data.paymentTransaction.id || data.paymentTransaction._id;
        var paymentTransaction = _.find(_paymentTransactions, {id: id});

        if (paymentTransaction) {
            var onPaymentTransactionDeleted = function (err, deletedPaymentTransaction) {
                if (err) {
                    _error(err);
                    _contextChangedWithError(err, requestId);
                } else {
                    var inputData = {id: deletedPaymentTransaction._id.toString()};
                    _delPaymentTransaction(inputData, requestId);
                }
            };

            if (!data.skipDbOperation) {
                var inputData = {accountId: _id, id: paymentTransaction.id};
                if (_.has(data, 'hasAdminRole')) {
                    inputData.hasAdminRole = data.hasAdminRole;
                }
                /*if (data.paymentTransaction.removing) {
                    inputData.removing = data.paymentTransaction.removing;
                }*/
                db.delPaymentTransaction(inputData, onPaymentTransactionDeleted);
            } else {
                onPaymentTransactionDeleted(null, data.paymentTransaction);
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
                    var inputParametersError = _validateInputParameters(data, [{'paymentTransaction' : ['id']}]);
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
                    var inputParametersError = _validateInputParameters(data, [{'paymentTransaction' : ['worktyId']}]);
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
                    var inputParametersError = _validateInputParameters(data, [{'paymentTransaction' : ['id']}]);
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
                    var inputParametersError = _validateInputParameters(data, [{'paymentTransaction' : ['id']}]);
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

module.exports = PaymentsContext;