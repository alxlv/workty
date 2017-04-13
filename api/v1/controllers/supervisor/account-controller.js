'use strict';
/**
 * Created by Alex Levshin on 27/5/16.
 */
var _ = require('lodash');
var AccountModel = require('../../models/account').defaultModel;
var AclPermissionModel = require('../../models/acl-permission').defaultModel;
var AclResourceModel = require('../../models/acl-resource').defaultModel;
var AclRoleModel = require('../../models/acl-role').defaultModel;
var mongoose = require('mongoose');
var util = require('util');
var crypto = require('crypto');
require('mongoose-when');
var errorSupervisorController = require('./error-controller')();
var PerPageItems = 10;
var MinPageItems = 0;
var MaxPageItems = 250;

var SupervisorAccountController = function() {

    return {
        getAll: function (data, cb) {
            var params = data;
            var findCriteria = {};
            var excludeKeys = ['sort', 'fields', 'count', 'pretty', 'page_num', 'per_page'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria._id = params.accountId;
                }

                delete params.accountId;
                delete params.hasAdminRole;
            }

            var query = AccountModel.find(findCriteria);

            // Filter
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                query = query.where(key).equals(params[key]);
            });

            // Sort
            if (params.sort) {
                var sort = params.sort.split(',').join(' ');
                query = query.sort(sort);
            }

            // Include/exclude fields in output
            if (params.fields) {
                var fields = params.fields.split(',').join(' ');
                query = query.select(fields);
            }

            if (params.per_page > 0) {
                var pageNum = params.page_num || 1;
                var perPage = params.per_page || PerPageItems;

                // Pagination
                if (pageNum > 0) {
                    if (perPage < MinPageItems || perPage > MaxPageItems) {
                        perPage = PerPageItems;
                    }
                }

                query = query.skip(perPage * (pageNum - 1));
                query = query.limit(perPage);
            }

            query.exec().then(function _onAccountsFound(accounts) {
                cb(null, accounts);
            }).end(function _onAccountsFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        getById: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var excludeKeys = ['fields', 'pretty', 'id', 'count', 'sort', 'page_num', 'per_page'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria._id = params.accountId;
                }

                delete params.accountId;
                delete params.hasAdminRole;
            }

            var query = AccountModel.findOne(findCriteria);

            // Filter
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                query = query.where(key).equals(params[key]);
            });

            // Include/exclude fields in output
            if (params.fields) {
                var fields = params.fields.split(',').join(' ');
                query = query.select(fields);
            }

            query.exec().then(function _onAccountFound(account) {
                if (!account) {
                    return cb(null, {});
                }

                cb(null, account);
            }).end(function _onAccountFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        add: function (data, cb) {
            var params = data;

            var newAccount = new AccountModel();
            newAccount.name = params.name || '';
            newAccount.email = params.email || '';
            newAccount.oauthID = params.oauthID || '';
            newAccount.password = params.password || crypto.randomBytes(16).toString('hex');
            let roleNames;
            if (_.has(params, 'aclRoleNames')) {
                roleNames = params.aclRoleNames;
            } else {
                roleNames = 'regular';
            }
            newAccount.aclRoleNames = roleNames;

            newAccount.save(function _onAccountSaved(err, savedAccount) {
                if (err) {
                    if (err.name === 'ValidationError') {
                        return cb(errorSupervisorController.createMissingParameterError({validationError: err, inputParameters: data}));
                    }

                    return cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }

                if (!savedAccount) {
                    return cb(errorSupervisorController.createEntityNotSaved({inputParameters: data}));
                }

                cb(null, savedAccount);
            });
        },
        update: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var updateCriteria = {};
            var excludeKeys = ['id', '_id', 'sort', 'accountId', 'created', 'fields', 'count', 'pretty', 'page_num', 'per_page', 'amount'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria._id = params.accountId;
                }

                delete params.accountId;
                delete params.hasAdminRole;
            }

            // Update
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                // Need to validate required fields manually because of findOneAndUpdate skip it
                if (key === 'email' && !params[key]) {
                    var err = {
                        errors: {
                            name: {
                                message: 'Path `email` is required.'
                            }
                        }
                    };

                    return cb(errorSupervisorController.createMissingParameterError({validationError: err, inputParameters: data}));
                }
                updateCriteria[key] = params[key];
            });

            if (Object.keys(updateCriteria).length === 0) {
                return cb(errorSupervisorController.createBadDigestError({inputParameters: data}));
            }

            let query = AccountModel.findOneAndUpdate(findCriteria, {'$set': updateCriteria}, {'new': true});
            query.exec().then(function _onAccountFoundAndUpdated(updatedAccount) {
                if (!updatedAccount) {
                    return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                }

                cb(null, updatedAccount);
            }).end(function _onAccountFoundAndUpdatedError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        del: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria._id = params.accountId;
                }

                delete params.accountId;
                delete params.hasAdminRole;
            }

            var query = AccountModel.findOne(findCriteria);
            query.exec().then(function _onAccountFound(account) {
                if (!account) {
                    return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                }

                if (_.has(params, 'removing') && (params.removing === 'true' || params.removing === true)) {
                    account.remove();
                } else {
                    // Mark account as removed
                    account.removed = true;
                    account.removedDate = new Date();
                    account.save();
                }

                cb(null, account);
            }).end(function _onAccountFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
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
                default:
                    return cb(new Error('The dictionary name ' + data + ' was not found'));
            }
        }
    };
};

module.exports = SupervisorAccountController;

