'use strict';
/*
 * Created by Alex Levshin on 07/06/16.
 */
require('log-timestamp');
var _ = require('lodash');
var config = rootRequire('config');
var util = require('util');
var db = rootRequire('database/db').getInstance();
var WorkflowsContext = require('./contexts/workflows');
var DevicesContext = require('./contexts/devices');
var WorktiesContext = require('./contexts/workties');
var AccountsContext = require('./contexts/accounts');
var PaymentsContext = require('./contexts/payments');
var UiSettingsContext = require('./contexts/ui-settings');
var DictionariesContext = require('./contexts/dictionaries');
var protocol = rootRequire('shared/protocols/v1/restapi-sv.module').OPERATIONS;
var socketIOAuth = require('socketio-auth');
var socketIO = require('socket.io');
var LoggerController = rootRequire('api/shared-controllers/logger-controller')();

// Server socket is on worker device
// Client socket is UI express application
var supervisor = (function() {
    var _instance = null;
    var _webSocketClient = null;
    var _clientRootContexts = [];
    var _staticContexts = [];

    function _error(data) {
        var msg = '[supervisor app] ' + util.inspect(data, { depth: null });
        console.error(msg);
        LoggerController.error(msg);
    }

    function _debug(data) {
        var msg = '[supervisor app] ' + util.inspect(data, { depth: null });
        console.log(msg);
        LoggerController.debug(msg);
    }

    var _contextLocator = {
        get: function(id, name) {
            var clientRootContext = _.find(_clientRootContexts, { id: id });
            //_debug(clientContext);
            if (clientRootContext) {
                return clientRootContext[name];
            }
            return null;
        },
        upsertRootContext: function(data) {
            _upsertRootContext(data);
        }
    };

    function _upsertRootContext(data) {
        if (data.added) {
            _debug('Adding account ' + data.account._id);
            _createClientContexts(data.account);
        } else {
            var clientRootContext = _getClientRootContext(data.account._id.toString());

            if (clientRootContext) {
                // Create new account and update the old
                if (data.deleted) {
                    _debug('Deleting account ' + data.account._id);
                    _destroy(clientRootContext);
                    _clientRootContexts = _.without(_clientRootContexts, clientRootContext);
                } else {
                    // Create new account acl and update the old
                    db.upsertAccountRoleNames(data.account, function _onAclUpserted(err, roleNames) {
                        if (err) {
                            _error(err);
                        } else {
                            clientRootContext.owner.aclRoleNames = roleNames;
                            clientRootContext.owner.amount = data.account.amount;
                        }
                    });
                }
            }
        }
    }

    function _createDevicesContext(contextOwner, contextName) {
        return new DevicesContext(contextOwner, contextName, _contextLocator);
    }

    function _createWorkflowsContext(contextOwner, contextName) {
        return new WorkflowsContext(contextOwner, contextName, _contextLocator);
    }

    function _createWorktiesContext(contextOwner, contextName) {
        return new WorktiesContext(contextOwner, contextName, _contextLocator);
    }

    function _createAccountsContext(contextOwner, contextName) {
        return new AccountsContext(contextOwner, contextName, _contextLocator);
    }

    function _createPaymentsContext(contextOwner, contextName) {
        return new PaymentsContext(contextOwner, contextName, _contextLocator);
    }

    function _createUiSettingsContext(contextOwner, contextName) {
        return new UiSettingsContext(contextOwner, contextName, _contextLocator);
    }

    function _createDictionariesContext(contextOwner, contextName) {
        return new DictionariesContext(contextOwner, contextName, _contextLocator);
    }

    function _createContextFactory(contextOwner, context) {
        switch (context.name.toLowerCase()) {
            case 'devices':
                if (context.static === true) {
                    if (!_staticContexts['devices']) {
                        _staticContexts['devices'] = _createDevicesContext(contextOwner, context.name);
                    }

                    return _staticContexts['devices'];
                } else {
                    return  _createDevicesContext(contextOwner, context.name);
                }
            case 'workflows':
                return _createWorkflowsContext(contextOwner, context.name);
            case 'workties':
                return _createWorktiesContext(contextOwner, context.name);
            case 'accounts':
                return _createAccountsContext(contextOwner, context.name);
            case 'payments':
                return _createPaymentsContext(contextOwner, context.name);
            case 'uisettings':
                return _createUiSettingsContext(contextOwner, context.name);
            case 'dictionaries':
                if (context.static === true) {
                    if (!_staticContexts['dictionaries']) {
                        _staticContexts['dictionaries'] = _createDictionariesContext(contextOwner, context.name);
                    }

                    return _staticContexts['dictionaries'];
                } else {
                    return _createDictionariesContext(contextOwner, context.name);
                }
            default:
                throw new Error('Unknown context name ' + context.name + ' for account id ' + contextOwner.id);
        }
    }

    function _loadAllClientContexts() {
        var inputData = {};
        db.getAllAccounts(inputData, function _onAccountsReturned(err, accounts) {
            if (err) {
                _error(err);
            } else {
                _debug('Loading ' + accounts.length + ' accounts...');
                _.forEach(accounts, function _onEachAccount(account) {
                    _createClientContexts(account);
                });
            }
        });
    }

    function _getClientRootContext(accountId) {
        return _.find(_clientRootContexts, {id: accountId});
    }

    function _createClientContexts(account) {
        var clientRootContext = _getClientRootContext(account._id);

        if (!clientRootContext) {
            // Create account acl
            db.upsertAccountRoleNames(account, function _onAclAccountCreated(err, aclAccount) {
                if (err) {
                    _error(err);
                } else {
                    // Get all contexts
                    db.getContexts(null, function _onContextsReturned(err, contexts) {
                        if (err) {
                            _error(err);
                        } else {
                            // Create owner property
                            var owner = {};
                            owner.acl = aclAccount;
                            owner.id = account._id.toString();
                            owner.amount = account.amount;

                            // Create new client root context
                            var newClientRootContext = {};
                            newClientRootContext.id = account._id.toString();
                            newClientRootContext.owner = owner;
                            newClientRootContext.contextsNames = [];

                            _.forEach(contexts, function _onEachContext(context) {
                                var contextName = context.name;
                                try {
                                    // Create allowed context
                                    newClientRootContext[contextName] = _createContextFactory(newClientRootContext.owner, context);
                                    newClientRootContext.contextsNames.push(contextName);
                                    newClientRootContext[contextName].static = context.static === true;

                                    if (_webSocketClient !== null) {
                                        var nsp = _webSocketClient.of('/' + newClientRootContext.id + '_' + contextName);
                                        //_debug('/' + newClientContext.id + '_' + contextName);

                                        // Authenticate external clients
                                        socketIOAuth(nsp, {
                                            authenticate: _authenticate,
                                            postAuthenticate: _postAuthenticate,
                                            timeout: context.authTimeout
                                        });

                                        var onContextClientConnected = function (socket) {
                                            _debug('Attaching client to ' + '/' + newClientRootContext.id + '_' + contextName);
                                            newClientRootContext[contextName].attachSocket(socket);
                                            //nsp.removeListener('connect', onContextClientConnected);
                                        };

                                        nsp.on('connect', onContextClientConnected);
                                        var msg = 'Creating ';
                                        if (context.static === true) {
                                            msg += 'static ';
                                        }

                                        msg += contextName + ' context for account id ' + account._id.toString();
                                        _debug(msg);
                                    }
                                } catch (err) {
                                    _error(err);
                                }
                            });

                            _clientRootContexts.push(newClientRootContext);
                        }
                    });
                }
            });
        }
    }

    function _authenticate(data, cb) {
        if (data.token) {
            _authenticateByToken(data, cb);
        } else if (data.email && data.password) {
            _authenticateByEmail(data, cb);
        }
    }

    function _authenticateByToken(data, cb) {
        db.authenticateByToken(data, function _onAccountAuthenticated(err, account) {
            if (err) { _error(err); cb(err); }
            else {
                cb(null, account);
            }
        });
    }

    function _authenticateByEmail(data, cb) {
        db.authenticateByEmail(data, function _onAccountAuthenticated(err, account) {
            if (err) { _error(err); cb(err); }
            else {
                cb(null, account);
            }
        });
    }

    function _postAuthenticate() {

    }

    function _destroy(clientRootContext) {
        _.forEach(clientRootContext.contextsNames, function _onEachContextName(contextName) {
            // Delete client context only if the last root context is being destroyed or it's not static
            if (clientRootContext[contextName].static !== true || _clientRootContexts.length === 1) {
                // Destroy the client context
                clientRootContext[contextName].destroy();
            }
        });
    }

    function _handleWorkflowRestApi(socket) {
        var ResourceName = 'workflows';

        // Access RestAPI to supervisor API
        socket.on(protocol[ResourceName].ADD.name, function _onWorkflowAdded(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.add(data);
            }
        });

        socket.on(protocol[ResourceName].UPD.name, function _onWorkflowUpdated(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.update(data);
            }
        });

        socket.on(protocol[ResourceName].DEL.name, function _onWorkflowDeleted(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.del(data);
            }
        });

        socket.on(protocol[ResourceName].RUN.name, function _onWorkflowRun(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.run(data);
            }
        });

        socket.on(protocol[ResourceName].PAUSE.name, function _onWorkflowPaused(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.pause(data);
            }
        });

        socket.on(protocol[ResourceName].STOP.name, function _onWorkflowStopped(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.stop(data);
            }
        });

        socket.on(protocol[ResourceName].ADD_WORKTY_INSTANCE.name, function _onWorkflowWorktyInstanceAdded(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.addWorktyInstance(data);
            }
        });

        socket.on(protocol[ResourceName].UPD_WORKTY_INSTANCE.name, function _onWorkflowWorktyInstanceUpdated(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.updateWorktyInstance(data);
            }
        });

        socket.on(protocol[ResourceName].DEL_WORKTY_INSTANCE.name, function _onWorkflowWorktyInstanceDeleted(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.delWorktyInstance(data);
            }
        });

        socket.on(protocol[ResourceName].UPD_WORKTY_INSTANCE_PROPERTY.name, function _onWorkflowWorktyInstancePropertyUpdated(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workflows) {
                data.skipDbOperation = true;
                clientContext.workflows.updateWorktyInstanceProperty(data);
            }
        });
    }

    function _handleWorktyRestApi(socket) {
        var ResourceName = 'workties';

        socket.on(protocol[ResourceName].ADD.name, function _onWorktyAdded(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workties) {
                data.skipDbOperation = true;
                clientContext.workties.add(data);
            }
        });

        socket.on(protocol[ResourceName].UPD.name, function _onWorktyUpdated(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workties) {
                data.skipDbOperation = true;
                clientContext.workties.update(data);
            }
        });

        socket.on(protocol[ResourceName].DEL.name, function _onWorktyDeleted(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workties) {
                data.skipDbOperation = true;
                clientContext.workties.del(data);
            }
        });

        socket.on(protocol[ResourceName].ADD_PROPERTY.name, function _onWorktyPropertyAdded(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workties) {
                data.skipDbOperation = true;
                clientContext.workties.addProperty(data);
            }
        });

        socket.on(protocol[ResourceName].UPD_PROPERTY.name, function _onWorktyPropertyUpdated(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workties) {
                data.skipDbOperation = true;
                clientContext.workties.updateProperty(data);
            }
        });

        socket.on(protocol[ResourceName].DEL_PROPERTY.name, function _onWorktyPropertyDeleted(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.workties) {
                data.skipDbOperation = true;
                clientContext.workties.delProperty(data);
            }
        });
    }

    function _handleAccountRestApi(socket) {
        var ResourceName = 'accounts';

        socket.on(protocol[ResourceName].ADD.name, function _onWorktyAdded(data) {
            var clientContext = _getClientRootContext(data.account._id);
            if (!clientContext) {
                _upsertRootContext({account: data.account, added: true});
            }
        });

        socket.on(protocol[ResourceName].UPD.name, function _onWorktyUpdated(data) {
            var clientContext = _getClientRootContext(data.account._id);
            if (clientContext) {
                _upsertRootContext({account: data.account});
            }
        });

        socket.on(protocol[ResourceName].DEL.name, function _onWorktyDeleted(data) {
            var clientContext = _getClientRootContext(data.account._id);
            if (clientContext) {
                _upsertRootContext({account: data.account, deleted: true});
            }
        });
    }

    function _handlePaymentRestApi(socket) {
        var ResourceName = 'payments';

        socket.on(protocol[ResourceName].ADD.name, function _onPaymentTransactionAdded(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.payments) {
                data.skipDbOperation = true;
                clientContext.payments.add(data);
            }
        });

        socket.on(protocol[ResourceName].UPD.name, function _onPaymentTransactionUpdated(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.payments) {
                data.skipDbOperation = true;
                clientContext.payments.update(data);
            }
        });

        socket.on(protocol[ResourceName].DEL.name, function _onPaymentTransactionDeleted(data) {
            var clientContext = _getClientRootContext(data.accountId);
            if (clientContext && clientContext.payments) {
                data.skipDbOperation = true;
                clientContext.payments.del(data);
            }
        });
    }

    function _createInstance() {
        return {
            // server - expressjs app server
            init: function(server) {
                var timer;
                // Communicate with web clients over socketio (supervisor is server)
                _webSocketClient = socketIO.listen(server);

                function sendHeartbeat(socket) {
                    socket.emit('ping', {beat: 1});
                }

                // Communicate with Restful API server over socketio (supervisor is server)
                var nspSupervisor = _webSocketClient.of('/' + config.supervisor.name);

                // Authenticate rest api client
                socketIOAuth(nspSupervisor, {
                    authenticate: _authenticateByEmail,
                    postAuthenticate: _postAuthenticate,
                    timeout: config.supervisor.authTimeout
                });

                nspSupervisor.on('connect', function _onRespApiClientConnected(socket) {
                    _debug('RestAPI client connected to supervisor server');

                    _handleWorkflowRestApi(socket);
                    _handleWorktyRestApi(socket);
                    _handleAccountRestApi(socket);
                    _handlePaymentRestApi(socket);

                    socket.on('pong', function(data){
                        _debug("RestAPI client pong received");
                    });

                    socket.on('disconnect', function _onDisconnected(data) {
                        _debug('RestAPI client is disconnected ' + data);
                        if (timer) {
                            clearInterval(timer);
                        }
                    });

                    //socket.emit(protocol.INITIALIZED);
                    timer = setInterval(sendHeartbeat.bind(null, socket), config.supervisor.hearbeatTimeout);
                });

                // Load all client contexts
                _loadAllClientContexts();
            }
        };
    }

    return {
        getInstance: function () {
            if (_instance === null) {
                _instance = _createInstance();
            }

            return _instance;
        }
    };
})();

module.exports = supervisor;