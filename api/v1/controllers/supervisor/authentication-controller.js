'use strict';
/**
 * Created by Alex Levshin on 18/11/16.
 */
var _ = require('lodash');
var AccountModel = require('../../models/account').defaultModel;
var AclResourceModel = require('../../models/acl-resource').defaultModel;
var AclPermissionModel = require('../../models/acl-permission').defaultModel;
var AclRoleModel = require('../../models/acl-role').defaultModel;
var errorSupervisorController = require('./error-controller')();
var crypto = require('crypto');
var acl = require('acl');
var config = rootRequire('config');
let LoggerController = rootRequire('api/shared-controllers/logger-controller');
let util = require('util');

global.accountsAclList = global.accountsAclList ? global.accountsAclList : new acl(new acl.memoryBackend());

var SupervisorAuthenticationController = function () {
    const contextName = 'auth';

    function _error(data) {
        var msg = contextName + ' ctrl: ' + util.inspect(data, {depth: null});
        console.error(msg);
        LoggerController.error(msg);
    }

    function _debug(data) {
        var msg = contextName + ' ctrl: ' + util.inspect(data, {depth: null});
        console.log(msg);
        LoggerController.debug(msg);
    }

    function _init() {
        let promise = AclRoleModel.getAll();
        promise.then((result) => {
            _.forEach(result, (aclRole) => {
                global.accountsAclList.allow([{roles: aclRole.name, allows: aclRole.allows}]);
            });
        }, (err) => {
            _error(err);
        })
    }

    function _addUserRole(accountId, roleNames, cb) {
        global.accountsAclList.addUserRoles(accountId.toString(), roleNames, function _onUserRoleAdded(err) {
            if (err) {
                cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: {accountId: accountId, roleNames: roleNames}}));
            } else {
                cb(null, roleNames);
            }
        });
    }

    function _hasAccountAclRole(accountId, roleName, cb) {
        // Get the list of user and assigned roles
        global.accountsAclList.hasRole(accountId.toString(), roleName, function _onUserRolesReturned(err, hasRole) {
            if (err) {
                cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: {accountId: accountId, roleName: roleName}}));
            } else {
                cb(null, hasRole);
            }
        });
    }

    function _isPermissionsAllowed(accountId, resourceName, permissionName, cb) {
        global.accountsAclList.isAllowed(accountId.toString(), resourceName, permissionName, function _onResourcePermissionsAllowed(err, allowed) {
            if (err) {
                cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: {accountId: accountId, resourceName: resourceName, permissionName: permissionName}}));
            } else {
                if (!allowed) {
                    cb(errorSupervisorController.createOperationForbiddenError({inputParameters: {accountId: accountId, resourceName: resourceName, permissionName: permissionName}}));
                } else {
                    cb(null);
                }
            }
        });
    }

    // Load acl roles
    _init();

    return {
        getAll: function(data, cb) {
            AccountModel.find(data, function (err, accounts) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                } else {
                    cb(null, accounts);
                }
            });
        },
        getById: function (data, cb) {
            AccountModel.findOne({ _id: data.id }, function (err, account) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                } else {
                    cb(null, account);
                }
            });
        },
        authenticateByToken: function (data, cb) {
            this.getById(data, function _onAccountFound(err, account) {
                if (err) {
                    cb(errorSupervisorController.createInvalidCredentialsError({ err: err, inputParameters: data }));
                } else {
                    if (account.removed) {
                        cb(errorSupervisorController.createAccountRemovedError({ inputParameters: data }));
                    } else {
                        var sha256db = crypto.createHash('sha256');
                        sha256db.update(account._id.toString());
                        sha256db.update(account.email);
                        sha256db.update(account.password);

                        var resultDb = sha256db.digest('hex');

                        if (resultDb !== data.token) {
                            cb(errorSupervisorController.createInvalidCredentialsError({ inputParameters: data }));
                        } else {
                            cb(null, account);
                        }
                    }
                }
            });
        },
        authenticateByEmail: function (data, cb) {
            AccountModel.authenticateByEmail(data.email, data.password, function (err, account) {
                if (err || !account) {
                    cb(errorSupervisorController.createInvalidCredentialsError({ err: err, inputParameters: data }));
                } else {
                    if (account.removed) {
                        cb(errorSupervisorController.createAccountRemovedError({ inputParameters: data }));
                    } else {
                        cb(null, account);
                    }
                }
            });
        },
        authenticateByProfile: function (data, cb) {
            AccountModel.authenticateByProfile(data.profile.displayName, data.profile.id, function (err, account) {
                if (err) {
                    cb(errorSupervisorController.createInvalidCredentialsError({ err: err, inputParameters: data }));
                } else {
                    if (account.removed) {
                        cb(errorSupervisorController.createAccountRemovedError({ inputParameters: data }));
                    } else {
                        cb(null, account);
                    }
                }
            });
        },
        getContexts: function (data, cb) {
            return AclResourceModel.getAll(cb);
        },
        findContextByName: function (data, cb) {
            return AclResourceModel.findByName(data);
        },
        upsertAccountAclRoleNames: function(data, cb) {
            _addUserRole(data._id.toString(), data.aclRoleNames, cb);
        },
        isAclPermissionAllowed: function(data, cb) {
            var inputData = {};
            inputData.id = data.accountId;
            this.getById(inputData, function _onAccountReturned(err, account) {
                if (err) {
                    cb(err);
                } else {
                    // Get the list of user and assigned roles
                    global.accountsAclList.userRoles(data.accountId.toString(), function _onUserRolesReturned(err, roles) {
                        if (err) {
                            cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                        } else {
                            // The user is not added yet?
                            if (roles.length === 0) { // No
                                global.accountsAclList.addUserRoles(data.accountId.toString(), account.aclRoleNames, function _onUserRoleAdded(err) {
                                    if (err) {
                                        cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                                    } else {
                                        // Check permissions
                                        _isPermissionsAllowed(data.accountId, data.resourceName, data.permissionName, cb);
                                    }
                                });
                            } else { // Yes
                                // Check permissions
                                _isPermissionsAllowed(data.accountId, data.resourceName, data.permissionName, cb);
                            }
                        }
                    });
                }
            });
        },
        hasAccountAdminAclRole: function(data, cb) {
            var inputData = {};
            inputData.id = data.accountId;
            this.getById(inputData, function _onAccountReturned(err, account) {
                if (err) {
                    cb(err);
                } else {
                    _hasAccountAclRole(data.accountId, 'admin', cb);
                }
            });
        },
        getDictionary: function(data, cb) {
            switch (data) {
                case 'acl-permission':
                    return AclPermissionModel.getAll(cb);
                case 'acl-resource':
                    return AclResourceModel.getAll(cb);
                case 'acl-role':
                    return AclRoleModel.getAll(cb);
            }
        }
    };
};

module.exports = SupervisorAuthenticationController;