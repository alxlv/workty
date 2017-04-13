'use struct';
/**
 * Created by pimaster on 30/7/16.
 */
var mongoose = require('mongoose');
var util = require('util');
var config = rootRequire('config');
var latestVersion = config.restapi.getLatestVersion();
var ApiPrefix = 'api/v' + latestVersion.major + '/';
var authenticationSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/authentication-controller')();
var accountSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/account-controller')();
var workflowSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/workflow-controller')();
var worktySupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/workty-controller')();
var deviceSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/device-controller')();
var paymentSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/payment-controller')();
var uiSettingsSupervisorController = rootRequire(ApiPrefix  + '/controllers/supervisor/ui-settings-controller')();
var loggerController = rootRequire('api/shared-controllers/logger-controller')();

var WorktyDb = (function _WorktyDb() {
    var _instance = null;

    function _createInstance() {
        return {
            // Devices API
            getAllDevices: function(data, cb) {
                deviceSupervisorController.getAll(data, cb);
            },
            getDeviceById: function(data, cb) {
                deviceSupervisorController.getById(data, cb);
            },
            addDevice: function(data, cb) {
                deviceSupervisorController.add(data, cb);
            },
            updateDevice: function(data, cb) {
                deviceSupervisorController.update(data, cb);
            },
            delDevice: function(data, cb) {
                deviceSupervisorController.del(data, cb);
            },
            borrowDevice: function(data, cb) {
                var inputData = data || {};
                inputData.operation = 'borrow';
                deviceSupervisorController.setState(inputData, cb);
            },
            returnDevice: function(data, cb) {
                var inputData = data || {};
                inputData.operation = 'return';
                deviceSupervisorController.setState(inputData, cb);
            },

            // Auth API
            authenticateByToken: function (data, cb) {
                authenticationSupervisorController.authenticateByToken(data, cb);
            },
            authenticateByEmail: function(data, cb) {
                authenticationSupervisorController.authenticateByEmail(data, cb);
            },
            authenticateByProfile: function(data, cb) {
                authenticationSupervisorController.authenticateByProfile(data, cb);
            },
            getContexts: function(data, cb) {
                authenticationSupervisorController.getContexts(data, cb);
            },
            findContextByName: function(data, cb) {
                return authenticationSupervisorController.findContextByName(data, cb);
            },
            upsertAccountRoleNames: function(data, cb) {
                authenticationSupervisorController.upsertAccountAclRoleNames(data, cb);
            },
            isPermissionAllowed: function(data, cb) {
                authenticationSupervisorController.isAclPermissionAllowed(data, cb);
            },
            hasAccountAdminRole(data, cb) {
                authenticationSupervisorController.hasAccountAdminAclRole(data, cb);
            },

            // Account API
            getAllAccounts: function(data, cb) {
                accountSupervisorController.getAll(data, cb);
            },
            getAccountById: function(data, cb) {
                accountSupervisorController.getById(data, cb);
            },
            /*
            addDefaultAccount: function(data, cb) {
                accountSupervisorController.addDefault(data, cb);
            },*/
            addAccount: function(data, cb) {
                accountSupervisorController.add(data, cb);
            },
            updateAccount: function(data, cb) {
                accountSupervisorController.update(data, cb);
            },
            delAccount: function(data, cb) {
                accountSupervisorController.del(data, cb);
            },

            // Payments API
            checkBalance: function(data, cb) {
                paymentSupervisorController.checkBalance(data, cb);
            },
            getAllPaymentTransactions: function(data, cb) {
                paymentSupervisorController.getAll(data, cb);
            },
            getPaymentTransactionById: function(data, cb) {
                paymentSupervisorController.getById(data, cb);
            },
            addPaymentTransaction: function(data, cb) {
                paymentSupervisorController.add(data, cb);
            },
            updatePaymentTransaction: function(data, cb) {
                paymentSupervisorController.update(data, cb);
            },
            delPaymentTransaction: function(data, cb) {
                paymentSupervisorController.del(data, cb);
            },

            // Workflows API
            getAllWorkflows: function(data, cb) {
                workflowSupervisorController.getAll(data, cb);
            },
            getWorkflowById: function(data, cb) {
                workflowSupervisorController.getById(data, cb);
            },
            addWorkflow: function(data, cb) {
                workflowSupervisorController.add(data, cb);
            },
            updateWorkflow: function(data, cb) {
                workflowSupervisorController.update(data, cb);
            },
            delWorkflow: function(data, cb) {
                workflowSupervisorController.del(data, cb);
            },
            runWorkflow: function(data, cb) {
                workflowSupervisorController.run(data, cb);
            },
            pauseWorkflow: function(data, cb) {
                workflowSupervisorController.pause(data, cb);
            },
            stopWorkflow: function(data, cb) {
                workflowSupervisorController.stop(data, cb);
            },
            getWorktyInstanceById: function(data, cb) {
                workflowSupervisorController.getWorktyInstanceById(data, cb);
            },
            addWorktyInstance: function(data, cb) {
                workflowSupervisorController.addWorktyInstance(data, cb);
            },
            updateWorktyInstance: function(data, cb) {
                workflowSupervisorController.updateWorktyInstance(data, cb);
            },
            delWorktyInstance: function(data, cb) {
                workflowSupervisorController.delWorktyInstance(data, cb);
            },
            updateWorktyInstanceProperty: function(data, cb) {
                workflowSupervisorController.updateWorktyInstanceProperty(data, cb);
            },

            // Workties API
            getAllWorkties: function(data, cb) {
                worktySupervisorController.getAll(data, cb);
            },
            getWorktyById: function(data, cb) {
                worktySupervisorController.getById(data, cb);
            },
            addWorkty: function(data, cb) {
                worktySupervisorController.add(data, cb);
            },
            updateWorkty: function(data, cb) {
                worktySupervisorController.update(data, cb);
            },
            delWorkty: function(data, cb) {
                worktySupervisorController.del(data, cb);
            },
            getAllWorktyProperties: function(data, cb) {
                worktySupervisorController.getAllProperties(data, cb);
            },
            getWorktyPropertyById: function(data, cb) {
                worktySupervisorController.getPropertyById(data, cb);
            },
            addWorktyProperty: function(data, cb) {
                worktySupervisorController.addProperty(data, cb);
            },
            updateWorktyProperty: function(data, cb) {
                worktySupervisorController.updateProperty(data, cb);
            },
            delWorktyProperty: function(data, cb) {
                worktySupervisorController.delProperty(data, cb);
            },
            getLanguageTypeName: function(data, cb) {
                return worktySupervisorController.getLanguageTypeName(data, cb);
            },
            getCategoryPath: function(data, cb) {
                return worktySupervisorController.getCategoryPath(data, cb);
            },
            getDictionary: function(data, cb) {
                if (data.name.indexOf('workty-') === 0) {
                    worktySupervisorController.getDictionary(data.name, cb);
                } else if (data.name.indexOf('workflow-') === 0) {
                    workflowSupervisorController.getDictionary(data.name, cb);
                } else if (data.name.indexOf('device-') === 0) {
                    deviceSupervisorController.getDictionary(data.name, cb);
                } else if (data.name.indexOf('acl-') === 0) {
                    authenticationSupervisorController.getDictionary(data.name, cb);
                } else {
                    throw new Error('Unknown dictionary name ' + data);
                }
            },

            // UI Settings API
            loadWorkflowUiSettings: function(data, cb) {
                uiSettingsSupervisorController.loadWorkflow(data, cb);
            },
            saveWorkflowUiSettings: function(data, cb) {
                uiSettingsSupervisorController.saveWorkflow(data, cb);
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

module.exports = WorktyDb;