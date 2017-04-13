'use strict';
/**
 * Created by Alex Levshin on 27/5/16.
 */
var _ = require('lodash');
var moment = require('moment');
var authenticationSupervisorController = require('./supervisor/authentication-controller')();
var paymentSupervisorController = require('./supervisor/payment-controller')();
var errorSupervisorController = require('./supervisor/error-controller')();
var protocol = rootRequire('shared/protocols/v1/restapi-sv.module').OPERATIONS;

var RestApiPaymentController = function (socket) {
    var _apiFullPath;
    var ResourceName = 'payments';

    function _authenticateByEmail(req, res, next) {
        var data = {};
        data.email = req.authorization.basic.username;
        data.password = req.authorization.basic.password;
        authenticationSupervisorController.authenticateByEmail(data, function (err, account) {
            if (err) {
                next(err);
            } else if (!account) {
                next(errorSupervisorController.createInvalidCredentialsError());
            } else if (account.removed) {
                next(errorSupervisorController.createAccountRemovedError());
            } else {
                req.accountId = account._id;
                next();
            }
        });
    }

    // External API
    this.init = function (server, apiFullPath, subVersion) {
        _apiFullPath = apiFullPath;

        var dateWrapper = moment(new Date(subVersion));
        if (dateWrapper.isValid()) {
            subVersion = dateWrapper.format('YYYY.M.D');
        }

        // Retrieves the all transactions
        // Retrieve the all transactions mentioning the word 'return' (Filtering & sorting & searching)
        server.get({path: apiFullPath + 'payments', version: subVersion}, _authenticateByEmail, this.getAll);

        // Retrieves a specific payment transaction #id
        server.get({path: apiFullPath + 'payments/:id', version: subVersion}, _authenticateByEmail, this.getById);

        // Creates a new payment transaction (for example, buy a workty)
        server.post({path: apiFullPath + 'payments', version: subVersion}, _authenticateByEmail, this.add);

        // Updates payment transaction #id
        server.put({path: apiFullPath + 'payments/:id', version: subVersion}, _authenticateByEmail, this.update);

        // Deletes payment transaction #id
        server.del({path: apiFullPath + 'payments/:id', version: subVersion}, _authenticateByEmail, this.del);
    };

    // apidoc engine
    /**
     * @api {get} /payments Get all payments
     * @apiVersion 1.0.0
     * @apiName GetPayments
     * @apiGroup Payments
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [sort]    The list of field names from payment model separated by comma that used for sorting
     * @apiParam {String[]} [fields]  The list of field names from payment model separated by comma that should be included in output result
     * @apiParam {Number}  [page_num=1] The page number that used as a first for pagination
     * @apiParam {Number}  [per_page=10] The number of workflows to send for pagination
     * @apiParam {Number}  [count] The number of sent payments
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword' -H 'accept-version: 2016.3.1' https://127.0.0.1:9999/api/v1/payments?pretty=true&sort=created
     *
     * @apiSuccess (Success 200) {Object[]} payments The array of payments for current account. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      [
     *          {
     *               "id": 54688a597129c4c6419c4f76,
     *               "accountId": 54688a597129c4c6419c4f11,
     *               "worktyId": 54688a597129c4c6419c4f22,
     *               "msg": "payment for generic workty",
     *               "created": "2014-11-23T11:45:00.000Z"
     *          },
     *          {
     *               "id": 54688a597129c4c6419c4f77,
     *               "accountId": 54688a597129c4c6419c4f11,
     *               "worktyId": 54688a597129c4c6419c4f23,
     *               "msg": "payment for encrypt pdf file workty",
     *               "created": "2014-11-23T11:45:00.000Z"
     *          }
     *      ]
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      [
     *      ]
     *
     * @apiError (Error 5xx) {500} OPERATION_FORBIDDEN Operation is forbidden
     * @apiError (Error 5xx) {500} UNEXPECTED Unexpected error on server side
     * @apiError (Error 5xx) {500} ACCOUNT_REMOVED The account was removed
     * @apiError (Error 4xx) {401} INVALID_CREDENTIALS Invalid credentials
     * @apiErrorExample {json} 500 OPERATION_FORBIDDEN
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 13,
     *              error_link: https://127.0.0.1:9999/api/v1/13,
     *              message: 'The operation is forbidden'
     *          }
     *     }
     *
     * @apiErrorExample {json} 500 UNEXPECTED
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 1,
     *              error_link: https://127.0.0.1:9999/api/v1/1,
     *              message: 'Unexpected error, please check request parameters or contact with our support service'
     *          }
     *     }
     * @apiErrorExample {json} 500 ACCOUNT_REMOVED
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 14,
     *              error_link: https://127.0.0.1:9999/api/v1/14,
     *              message: 'The account was removed. Please recover it'
     *          }
     *     }
     * @apiErrorExample {json} 401 INVALID_CREDENTIALS
     *     HTTP/1.1 401 InvalidCredentials
     *     {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/401
     *          }
     *     }
     */
    this.getAll = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].REFRESH_ALL.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
            } else {
                let inputData = {};
                inputData.accountId = req.accountId;
                authenticationSupervisorController.hasAccountAdminAclRole(inputData, function _onAccountAdminAclRoleReturned(err, hasRole) {
                    if (err) {
                        next(errorSupervisorController.createOperationForbiddenError({
                            err: err,
                            inputParameters: req.params
                        }));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;
                        //console.log('[' + new Date() + ']' + ' get all payment transactions: ' + JSON.stringify(req.params));

                        paymentSupervisorController.getAll(params, function _onAllPaymentTransactionsReturned(err, paymentTransactions) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', paymentTransactions ? paymentTransactions.length : 0);
                                }

                                res.send(paymentTransactions);
                                next();
                            }
                        });
                    }
                });
            }
        });
    };

    // apidoc engine
    /**
     * @api {get} /payments/:id Get payment by id
     * @apiVersion 1.0.0
     * @apiName GetPayment
     * @apiGroup Payments
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [fields]  The list of field names from payment model separated by comma that should be included in output result
     * @apiParam {Number}  [count] The number of sent payments
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword' https://127.0.0.1:9999/api/v1/payments/547b689eba9d33302c164b6e
     *
     * @apiSuccess (Success 200) {Object} payment The payment. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      {
     *           "id": 547b689eba9d33302c164b6e,
     *           "accountId": 54688a597129c4c6419c4f11,
     *           "worktyId": 54688a597129c4c6419c4f22,
     *           "msg": "payment for generic workty",
     *           "created": "2014-11-23T11:45:00.000Z"
     *      }
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      {
     *      }
     *
     * @apiError (Error 5xx) {500} OPERATION_FORBIDDEN Operation is forbidden
     * @apiError (Error 5xx) {500} UNEXPECTED Unexpected error on server side
     * @apiError (Error 5xx) {500} ACCOUNT_REMOVED The account was removed
     * @apiError (Error 4xx) {401} INVALID_CREDENTIALS Invalid credentials
     * @apiErrorExample {json} 500 OPERATION_FORBIDDEN
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 13,
     *              error_link: https://127.0.0.1:9999/api/v1/13,
     *              message: 'The operation is forbidden'
     *          }
     *     }
     *
     * @apiErrorExample {json} 500 UNEXPECTED
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 1,
     *              error_link: https://127.0.0.1:9999/api/v1/1,
     *              message: 'Unexpected error, please check request parameters or contact with our support service'
     *          }
     *     }
     * @apiErrorExample {json} 500 ACCOUNT_REMOVED
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 14,
     *              error_link: https://127.0.0.1:9999/api/v1/14,
     *              message: 'The account was removed. Please recover it'
     *          }
     *     }
     * @apiErrorExample {json} 401 INVALID_CREDENTIALS
     *     HTTP/1.1 401 InvalidCredentials
     *     {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/401
     *          }
     *     }
     */
    this.getById = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].REFRESH.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
            } else {
                let inputData = {};
                inputData.accountId = req.accountId;
                authenticationSupervisorController.hasAccountAdminAclRole(inputData, function _onAccountAdminAclRoleReturned(err, hasRole) {
                    if (err) {
                        next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;
                        paymentSupervisorController.getById(params, function _onPaymentTransactionReturned(err, paymentTransaction) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', paymentTransaction ? 1 : 0);
                                }

                                res.send(paymentTransaction);
                                next();
                            }
                        });
                    }
                });
            }
        });
    };

    // apidoc engine
    /**
     * @api {post} /payments Add the new payment
     * @apiVersion 1.0.0
     * @apiName AddPayment
     * @apiGroup Payments
     *
     * @apiPermission Create
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data '{ "worktyId": "545f95ee2f82bdb917ad6f81" }' -k -v https://127.0.0.1:9999/api/v1/payments
     *
     * @apiSuccess (Success 201) {Object} payment The new payment
     *
     * @apiSuccessExample {json} 201 CREATED
     *     HTTP/1.1 201 Created
     *     {
     *           "id": 547b689eba9d33302c164b50,
     *           "accountId": 54688a597129c4c6419c4f11,
     *           "worktyId": "545f95ee2f82bdb917ad6f81,
     *           "msg": "payment for generic workty",
     *           "created": "2014-11-23T11:45:00.000Z"
     *     }
     *
     * @apiError (Error 5xx) {500} OPERATION_FORBIDDEN Operation is forbidden
     * @apiError (Error 5xx) {500} UNEXPECTED Unexpected error on server side
     * @apiError (Error 5xx) {500} ENT_NOT_FOUND The entity was not found
     * @apiError (Error 5xx) {500} ENT_NOT_SAVED The entity was not saved
     * @apiError (Error 5xx) {500} ACCOUNT_REMOVED The account was removed
     * @apiError (Error 4xx) {400} INVALID_CONTENT The input json value is not correct
     * @apiError (Error 4xx) {401} INVALID_CREDENTIALS Invalid credentials
     * @apiError (Error 4xx) {409} VALIDATION_ERR Validation error
     * @apiErrorExample {json} 500 OPERATION_FORBIDDEN
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 13,
     *              error_link: https://127.0.0.1:9999/api/v1/13,
     *              message: 'The operation is forbidden'
     *          }
     *      }
     * @apiErrorExample {json} 500 UNEXPECTED
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 1,
     *              error_link: https://127.0.0.1:9999/api/v1/1,
     *              message: 'Unexpected error, please check request parameters or contact with our support service'
     *          }
     *      }
     * @apiErrorExample {json} 500 ENT_NOT_FOUND
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 2,
     *              error_link: https://127.0.0.1:9999/api/v1/2,
     *              message: 'The entity was not found'
     *          }
     *      }
     * @apiErrorExample {json} 500 ENT_NOT_SAVED
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 5,
     *              error_link: https://127.0.0.1:9999/api/v1/5,
     *              message: 'The entity was not saved'
     *          }
     *      }
     * @apiErrorExample {json} 500 ACCOUNT_REMOVED
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 14,
     *              error_link: https://127.0.0.1:9999/api/v1/14,
     *              message: 'The account was removed. Please recover it'
     *          }
     *     }
     * @apiErrorExample {json} 400 INVALID_CONTENT
     *      HTTP/1.1 400 InvalidContent
     *      {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/400
     *          }
     *      }
     * @apiErrorExample {json} 401 INVALID_CREDENTIALS
     *     HTTP/1.1 401 InvalidCredentials
     *     {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/401
     *          }
     *     }
     * @apiErrorExample {json} 409 VALIDATION_ERR
     *      HTTP/1.1 409 MissingParameter
     *      {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/409,
     *              message: 'Validation error'
     *              errors: [
     *                  message: 'Path `worktyId` is required.'
     *              ]
     *          }
     *      }
     */
    this.add = function (req, res, next) {
        if (!req.is('application/json') && !req.is('json')) {
            // send 400
            return next(errorSupervisorController.createInvalidContentError({inputParameters: req.params}));
        }

        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].ADD.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
            } else {
                var params = req.params;
                params.accountId = req.accountId;
                //console.log('[' + new Date() + ']' + ' add payment transaction: ' + JSON.stringify(req.params));

                paymentSupervisorController.add(params, function _onPaymentTransactionAdded(err, result) {
                    if (err) {
                        next(err);
                    } else {
                        // Add transaction (send to supervisor)
                        var inputData = {paymentTransaction: result.paymentTransaction, workty: result.workty, accountId: params.accountId};
                        socket.emit(protocol[ResourceName].ADD.name, inputData);

                        res.header('Location', errorSupervisorController.formatLocationHeader(_apiFullPath + 'payments/' + result.paymentTransaction._id));
                        res.send(201, result.paymentTransaction);
                        next();
                    }
                });
            }
        });
    };

    // apidoc engine
    /**
     * @api {put} /payments/:id Update the existing payment
     * @apiVersion 1.0.0
     * @apiName UpdatePayment
     * @apiGroup Payments
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     *  curl -X PUT -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data '{ "msg": "another message" }' -k -v https://127.0.0.1:9999/api/v1/payments/545f95ee2f82bdb917ad6f81
     *
     * @apiSuccess {Object} payment The updated payment
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *           "id": 545f95ee2f82bdb917ad6f81,
     *           "accountId": 54688a597129c4c6419c4f11,
     *           "worktyId": "545f95ee2f82bdb917ad6f81,
     *           "msg": "another message",
     *           "created": "2014-11-23T11:45:00.000Z"
     *     }
     *
     * @apiError (Error 5xx) {500} OPERATION_FORBIDDEN Operation is forbidden
     * @apiError (Error 5xx) {500} UNEXPECTED Unexpected error on server side
     * @apiError (Error 5xx) {500} ENT_NOT_FOUND The entity was not found
     * @apiError (Error 5xx) {500} ENT_NOT_UPDATED The entity was not updated
     * @apiError (Error 5xx) {500} ACCOUNT_REMOVED The account was removed
     * @apiError (Error 4xx) {400} INVALID_CONTENT The input json value is not correct
     * @apiError (Error 4xx) {400} BAD_DIGEST No data to update
     * @apiError (Error 4xx) {401} INVALID_CREDENTIALS Invalid credentials
     * @apiErrorExample {json} 500 OPERATION_FORBIDDEN
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 13,
     *              error_link: https://127.0.0.1:9999/api/v1/13,
     *              message: 'The operation is forbidden'
     *          }
     *      }
     * @apiErrorExample {json} 500 UNEXPECTED
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 1,
     *              error_link: https://127.0.0.1:9999/api/v1/1,
     *              message: 'Unexpected error, please check request parameters or contact with our support service'
     *          }
     *      }
     * @apiErrorExample {json} 500 ENT_NOT_FOUND
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 2,
     *              error_link: https://127.0.0.1:9999/api/v1/2,
     *              message: 'The entity was not found'
     *          }
     *      }
     * @apiErrorExample {json} 500 ENT_NOT_UPDATED
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 3,
     *              error_link: https://127.0.0.1:9999/api/v1/3,
     *              message: 'The entity was not updated'
     *          }
     *      }
     * @apiErrorExample {json} 500 ACCOUNT_REMOVED
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 14,
     *              error_link: https://127.0.0.1:9999/api/v1/14,
     *              message: 'The account was removed. Please recover it'
     *          }
     *     }
     * @apiErrorExample {json} 400 INVALID_CONTENT
     *      HTTP/1.1 400 InvalidContent
     *      {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/400
     *          }
     *      }
     * @apiErrorExample {json} 400 BAD_DIGEST
     *      HTTP/1.1 400 BadDigest
     *      {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/400
     *          }
     *      }
     * @apiErrorExample {json} 401 INVALID_CREDENTIALS
     *     HTTP/1.1 401 InvalidCredentials
     *     {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/401
     *          }
     *     }
     */
    this.update = function (req, res, next) {
        if (!req.is('application/json') && !req.is('json')) {
            // send 400
            return next(errorSupervisorController.createInvalidContentError({inputParameters: req.params}));
        }

        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].UPD.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
            } else {
                let inputData = {};
                inputData.accountId = req.accountId;
                authenticationSupervisorController.hasAccountAdminAclRole(inputData, function _onAccountAdminAclRoleReturned(err, hasRole) {
                    if (err) {
                        next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;
                        //console.log('[' + new Date() + ']' + ' update payment transaction: ' + JSON.stringify(req.params));

                        paymentSupervisorController.update(params, function _onPaymentTransactionUpdated(err, updatedPaymentTransaction) {
                            if (err) {
                                next(err);
                            } else {
                                // Update payment transaction (send to supervisor)
                                var inputData = {
                                    paymentTransaction: updatedPaymentTransaction,
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].UPD.name, inputData);

                                // send 200
                                res.send(updatedPaymentTransaction);
                                next();
                            }
                        });
                    }
                });
            }
        });
    };

    // apidoc engine
    /**
     * @api {delete} /payments/:id Delete the existing payment
     * @apiVersion 1.0.0
     * @apiName DeletePayment
     * @apiGroup Payments
     *
     * @apiPermission Delete
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X DELETE -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/payments/545f95ee2f82bdb917ad6f81
     *
     * @apiSuccess {Object} payment The empty object
     *
     * @apiSuccessExample {json} 204 NO_CONTENT
     *      HTTP/1.1 204
     *      {
     *      }
     *
     * @apiError (Error 5xx) {500} OPERATION_FORBIDDEN Operation is forbidden
     * @apiError (Error 5xx) {500} UNEXPECTED Unexpected error on server side
     * @apiError (Error 5xx) {500} ENT_NOT_FOUND The entity was not found
     * @apiError (Error 5xx) {500} ACCOUNT_REMOVED The account was removed
     * @apiError (Error 4xx) {401} INVALID_CREDENTIALS Invalid credentials
     * @apiErrorExample {json} 500 OPERATION_FORBIDDEN
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 13,
     *              error_link: https://127.0.0.1:9999/api/v1/13,
     *              message: 'The operation is forbidden'
     *          }
     *      }
     * @apiErrorExample {json} 500 UNEXPECTED
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 1,
     *              error_link: https://127.0.0.1:9999/api/v1/1,
     *              message: 'Unexpected error, please check request parameters or contact with our support service'
     *          }
     *      }
     * @apiErrorExample {json} 500 ENT_NOT_FOUND
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 2,
     *              error_link: https://127.0.0.1:9999/api/v1/2,
     *              message: 'The entity was not found'
     *          }
     *      }
     * @apiErrorExample {json} 500 ACCOUNT_REMOVED
     *     HTTP/1.1 500 InternalError
     *     {
     *          error: {
     *              code: 14,
     *              error_link: https://127.0.0.1:9999/api/v1/14,
     *              message: 'The account was removed. Please recover it'
     *          }
     *     }
     * @apiErrorExample {json} 401 INVALID_CREDENTIALS
     *     HTTP/1.1 401 InvalidCredentials
     *     {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/401
     *          }
     *     }
     */
    this.del = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].DEL.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
            } else {
                let inputData = {};
                inputData.accountId = req.accountId;
                authenticationSupervisorController.hasAccountAdminAclRole(inputData, function _onAccountAdminAclRoleReturned(err, hasRole) {
                    if (err) {
                        next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;
                        //console.log('[' + new Date() + ']' + ' delete payment transaction: ' + JSON.stringify(req.params));

                        paymentSupervisorController.del(params, function _onPaymentTransactionDeleted(err, paymentTransaction) {
                            if (err) {
                                next(err);
                            } else {
                                // Delete workty (send to supervisor)
                                var inputData = {paymentTransaction: paymentTransaction, accountId: params.accountId};
                                socket.emit(protocol[ResourceName].DEL.name, inputData);

                                // Send 204 (No content)
                                res.header('Content-type', '');
                                res.send(204, {});
                                next();
                            }
                        });
                    }
                });
            }
        });
    };
};

module.exports = RestApiPaymentController;

