'use strict';
/**
 * Created by Alex Levshin on 27/5/16.
 */
var _ = require('lodash');
var PaymentTransactionModel = require('../../models/payment-transaction').defaultModel;
var mongoose = require('mongoose');
var util = require('util');
require('mongoose-when');
var accountSupervisorController = require('./account-controller')();
var worktySupervisorController = require('./workty-controller')();
var errorSupervisorController = require('./error-controller')();
var PerPageItems = 10;
var MinPageItems = 0;
var MaxPageItems = 250;

var SupervisorPaymentController = function() {

    return {
        checkBalance: function (data, cb) {
            var params = data;
            // Calculate real price
            var realPrice = (params.price / 100) * (1 - params.discountPercent / 100);
            var newAmount = params.amount - realPrice;
            if (newAmount < 0 && realPrice > 0) {
                cb(errorSupervisorController.createNotEnoughFundsError({ inputParameters: data }));
            } else {
                // Send the new amount value for the user
                cb(null, {newAmount: newAmount});
            }
        },
        getAll: function(data, cb) {
            var params = data;
            var findCriteria = {};
            var excludeKeys = ['sort', 'fields', 'count', 'pretty', 'page_num', 'per_page'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === true) {
                    excludeKeys.push('accountId');
                }

                delete params.hasAdminRole;
            }
            var query = PaymentTransactionModel.find(findCriteria);

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

            query.exec().then(function _onTransactionsFound(transactions) {
                cb(null, transactions);
            }).end(function _onTransactionsFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        getById: function(data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var excludeKeys = ['fields', 'pretty', 'id', 'count'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === true) {
                    excludeKeys.push('accountId');
                }

                delete params.hasAdminRole;
            }
            var query = PaymentTransactionModel.findOne(findCriteria);

            // Filter
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                query = query.where(key).equals(params[key]);
            });

            // Include/exclude fields in output
            if (params.fields) {
                var fields = params.fields.split(',').join(' ');
                query = query.select(fields);
            }

            query.exec().then(function _onTransactionFound(transaction) {
                cb(null, transaction);
            }).end(function _onTransactionFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        add: function (data, cb) {
            if (!data.worktyId) {
                var err = {
                    errors: {
                        name: {
                            message: 'Path `worktyId` is required.'
                        }
                    }
                };

                return cb(errorSupervisorController.createMissingParameterError({validationError: err, inputParameters: data}));
            }

            var params = data;
            var self = this;
            var inputData = {id: params.worktyId, template: true, embed: 'properties'};
            // Get the workty to buy and user's account
            worktySupervisorController.getById(inputData, function _onWorktyReturned(err, workty) {
                if (err) {
                    return cb(err);
                }

                if (!workty) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: params}));
                }

                inputData = {id: params.accountId, removed: false};
                // Get user's account
                accountSupervisorController.getById(inputData, function _onAccountReturned(err, account) {
                    if (err) {
                        return cb(err);
                    }

                    if (!account) {
                        return cb(errorSupervisorController.createEntityNotFound({inputParameters: params}));
                    }

                    // Check the amount on user's account
                    inputData = {price: workty.price, discountPercent: workty.discountPercent, amount: account.amount};
                    self.checkBalance(inputData, function _onBalanceChecked(err, data) {
                        if (err) {
                            return cb(err);
                        }

                        inputData = {workty: workty, accountId: params.accountId};
                        worktySupervisorController.copy(inputData, function _onWorktySaved(err, savedWorkty) {
                            if (err) {
                                cb(err);
                            }

                            // Create new transaction
                            var newTransaction = new PaymentTransactionModel();
                            newTransaction.worktyId = savedWorkty._id;
                            newTransaction.msg = 'ok'; // TODO: Change it, incapsulate
                            newTransaction.accountId = params.accountId;
                            newTransaction.save(function _onWorkflowSaved(err, addedTransaction) {
                                if (err) {
                                    return cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                                }

                                if (!addedTransaction) {
                                    return cb(errorSupervisorController.createEntityNotSaved({inputParameters: data}));
                                }

                                // Update user's amount value
                                account.amount = data.newAmount;
                                account.save();

                                // Send transaction and workty
                                cb(null, {paymentTransaction: addedTransaction, workty: savedWorkty});
                           });
                        });
                    });
                });
            });
        },
        update: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var updateCriteria = {};
            var excludeKeys = ['id', '_id', 'sort', 'accountId', 'created', 'fields', 'count', 'pretty', 'page_num', 'per_page', 'worktyId'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            // Update
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                updateCriteria[key] = params[key];
            });

            if (Object.keys(updateCriteria).length === 0) {
                return cb(errorSupervisorController.createBadDigestError({inputParameters: data}));
            }

            findCriteria = {_id: params.id};

            var query = PaymentTransactionModel.findOneAndUpdate(findCriteria, {'$set': updateCriteria}, {'new': true});
            query.exec().then(function _onPaymentTransactionFoundAndUpdated(updatedPaymentTransaction) {
                if (!updatedPaymentTransaction) {
                    return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                }

                cb(null, updatedPaymentTransaction);
            }).end(function _onPaymentTransactionFoundAndUpdatedError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        del: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = PaymentTransactionModel.findOne(findCriteria);
            query.exec().then(function _onPaymentTransactionFound(paymentTransaction) {
                if (!paymentTransaction) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                paymentTransaction.remove();

                cb(null, paymentTransaction);
            }).end(function _onPaymentTransactionFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        }
    };
};

module.exports = SupervisorPaymentController;

