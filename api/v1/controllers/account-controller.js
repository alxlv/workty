'use strict';
/**
 * Created by Alex Levshin on 27/5/16.
 */
var _ = require('lodash');
var moment = require('moment');
var authenticationSupervisorController = require('./supervisor/authentication-controller')();
var accountSupervisorController = require('./supervisor/account-controller')();
var protocol = rootRequire('shared/protocols/v1/restapi-sv.module').OPERATIONS;
var errorSupervisorController = require('./supervisor/error-controller')();

/** @class
 * @public
 * @classdesc Creates the instances of account controller.
 * @param {object} socket - The websocket object that used to communicate with supervisor.
 * @constructor
 */
var RestApiAccountController = function (socket) {
    var _apiFullPath;
    var ResourceName = 'accounts';

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

    // Use returnAsArray = true when calling routine from getAll()
    function _getAccountById(req, res, next, returnAsArray) {
        let params = req.params;
        params.accountId = req.accountId;

        authenticationSupervisorController.hasAccountAdminAclRole(params, function _onAccountAdminAclRoleReturned(err, hasRole) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
            } else {
                params.hasAdminRole = hasRole;
                //console.log('[' + new Date() + ']' + ' get account by id: '+ JSON.stringify(params));

                accountSupervisorController.getById(params, function _onAccountReturned(err, account) {
                    if (err) {
                        next(err);
                    } else {
                        if (params.count && params.count === 'true') {
                            res.header('Records-count', account ? 1 : 0);
                        }

                        if (returnAsArray) {
                            res.send([account]);
                        } else {
                            res.send(account);
                        }

                        next();
                    }
                });
            }
        });
    }

    function _addAccount(req, res, next) {
        let params = req.params;
        params.accountId = req.accountId;

        authenticationSupervisorController.hasAccountAdminAclRole(params, function _onAccountAdminAclRoleReturned(err, hasRole) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({ err: err, inputParameters: req.params }));
            } else {
                params.hasAdminRole = hasRole;
                //console.log('[' + new Date() + ']' + ' add account: ' + JSON.stringify(params));

                accountSupervisorController.add(params, function _onAccountAdded(err, account) {
                    if (err) {
                        next(err);
                    } else {
                        // Add account (send to supervisor)
                        var inputData = {account: account};
                        socket.emit(protocol[ResourceName].ADD.name, inputData);

                        // Send data to rest api user
                        res.header('Location', errorSupervisorController.formatLocationHeader(_apiFullPath + 'accounts/' + account._id));
                        res.send(201, account);
                        next();
                    }
                });
            }
        });
    }

    function _updateAccount(req, res, next) {
        let params = req.params;
        params.accountId = req.accountId;

        authenticationSupervisorController.hasAccountAdminAclRole(params, function _onAccountAdminAclRoleReturned(err, hasRole) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
            } else {
                params.hasAdminRole = hasRole;
                //console.log('[' + new Date() + ']' + ' update account: ' + JSON.stringify(params));

                accountSupervisorController.update(params, function _onAccountUpdated(err, updatedAccount) {
                    if (err) {
                        next(err);
                    } else {
                        // Update account (send to supervisor)
                        var inputData = {account: updatedAccount};
                        socket.emit(protocol[ResourceName].UPD.name, inputData);

                        // Send 200
                        res.send(updatedAccount);
                        next();
                    }
                });
            }
        });
    }

    function _delAccount(req, res, next) {
        let params = req.params;
        params.accountId = req.accountId;

        authenticationSupervisorController.hasAccountAdminAclRole(params, function _onAccountAdminAclRoleReturned(err, hasRole) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
            } else {
                params.hasAdminRole = hasRole;
                //console.log('[' + new Date() + ']' + ' delete account: ' + JSON.stringify(params));

                accountSupervisorController.del(params, function _onAccountDeleted(err, deletedAccount) {
                    if (err) {
                        next(err);
                    } else {
                        // Delete account (send to supervisor)
                        var inputData = {account: deletedAccount};
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

    // External API
    /**
     * @function
     * @description Initializes controller during server startup.
     * @param {object} server - The server instance object.
     * @param {string} apiFullPath - The full path to API.
     * @param {string} subVersion - The subversion of API.
     */
    this.init = function (server, apiFullPath, subVersion) {
        _apiFullPath = apiFullPath;

        var dateWrapper = moment(new Date(subVersion));
        if (dateWrapper.isValid()) {
            subVersion = dateWrapper.format('YYYY.M.D');
        }

        // Retrieves a list of accounts
        server.get({path: apiFullPath + 'accounts', version: subVersion}, _authenticateByEmail, this.getAll);

        // Retrieves a specific account #id
        server.get({path: apiFullPath + 'accounts/:id', version: subVersion}, _authenticateByEmail, this.getById);

        // Creates account
        server.post({path: apiFullPath + 'accounts', version: subVersion}, _authenticateByEmail, this.add);

        // Updates account #id
        server.put({path: apiFullPath + 'accounts/:id', version: subVersion}, _authenticateByEmail, this.update);

        // Deletes account #id
        server.del({path: apiFullPath + 'accounts/:id', version: subVersion}, _authenticateByEmail, this.del);
    };

    // jsdoc engine
    /** @function
     * @description Returns the list of all accounts. The user needs to have permission 'view'.
     * @param {object} req - The request object.
     * @param {object} res - The response object.
     * @param {function} next - The callback function that called next handler in the chain.
     */

    // apidoc engine
    /**
     * @api {get} /accounts Get all accounts
     * @apiVersion 1.0.0
     * @apiName GetAccounts
     * @apiGroup Accounts
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [sort]    The list of field names from account model separated by comma that used for sorting
     * @apiParam {String[]} [fields]  The list of field names from account model separated by comma that should be included in output result
     * @apiParam {Number}  [page_num=1] The page number that used as a first for pagination
     * @apiParam {Number}  [per_page=10] The number of accounts to send for pagination
     * @apiParam {Number}  [count] The number of sent accounts
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword' -H 'accept-version: 2016.3.1' https://127.0.0.1:9999/api/v1/accounts?pretty=true&sort=created
     *
     * @apiSuccess (Success 200) {Object[]} accounts The array of accounts. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      [
     *          {
     *              "id": 5465c70e7906b5bb7960f08f,
     *              "name": "account1",
     *              "email": "email@email.com",
     *              "acl": [],
     *              "created": "2016-02-03T05:00:00.000Z",
     *              "amount": 0,
     *              "removed": false,
     *              "removedDate", ""
     *          },
     *          {
     *              "id": 5465c70e7906b5bb7960f090,
     *              "name": "account2",
     *              "email": "foo@bar.com",
     *              "acl": [],
     *              "created": "2014-11-23T11:23:00.000Z",
     *              "amount": 100,
     *              "removed": false,
     *              "removedDate": ""
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
                        next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;
                        //console.log('[' + new Date() + ']' + ' get all accounts: ' + JSON.stringify(req.params));

                        accountSupervisorController.getAll(params, function _onAllAccountsReturned(err, accounts) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', accounts ? accounts.length : 0);
                                }

                                res.send(accounts);
                                next();
                            }
                        });
                    }
                });
            }
        });
    };

    /** @function
     * @description Returns the account by id. The user needs to have permission 'view'.
     * @example
     * curl -k -v -u 'youremail@mail.com':'userpassword' https://127.0.0.1:9999/api/v1/accounts/5465c70e7906b5bb7960f08f
     * @param {object} req - The request object.
     * @param {object} res - The response object.
     * @param {function} next - The callback function that called next handler in the chain.
     */

    // apidoc engine
    /**
     * @api {get} /accounts/:id Get account by id
     * @apiVersion 1.0.0
     * @apiName GetAccount
     * @apiGroup Accounts
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [fields]  The list of field names from account model separated by comma that should be included in output result
     * @apiParam {Number}  [count] The number of sent accounts
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword' -H 'accept-version: 2016.3.1' https://127.0.0.1:9999/api/v1/accounts/5465c70e7906b5bb7960f08f
     *
     * @apiSuccess (Success 200) {Object} account The account. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      {
     *          "id": 5465c70e7906b5bb7960f08f,
     *          "name": "account1",
     *          "email": "email@email.com",
     *          "acl": [],
     *          "created": "2016-02-03T05:00:00.000Z",
     *          "amount": 0,
     *          "removed": false,
     *          "removedDate", ""
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
                _getAccountById(req, res, next);
            }
        });
    };

    /** @function
     * @description Adds the new account. The user needs to have permission 'create'.
     * @example
     * curl -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data  '{ "name": "myaccount", "email": "myemail@mail.com" }' -k -v https://127.0.0.1:9999/api/v1/accounts
     * @param {object} req - The request object.
     * @param {object} res - The response object.
     * @param {function} next - The callback function that called next handler in the chain.
     */

    // apidoc engine
    /**
     * @api {post} /accounts Add the new account
     * @apiVersion 1.0.0
     * @apiName AddAccount
     * @apiGroup Accounts
     *
     * @apiPermission Create
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     *  curl -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data '{ "name": "myaccount", "email": "myemail@mail.com" }' -k -v https://127.0.0.1:9999/api/v1/accounts
     *
     * @apiSuccess (Success 201) {Object} account The new account
     *
     * @apiSuccessExample {json} 201 CREATED
     *     HTTP/1.1 201 Created
     *     {
     *          "id": 5465c70e7906b5bb7960f912,
     *          "name": "account1",
     *          "email": "email@email.com",
     *          "acl": [],
     *          "created": "2016-02-03T05:00:00.000Z",
     *          "amount": 0,
     *          "removed": false,
     *          "removedDate", ""
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
     *                  message: 'Path `email` is required.'
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
                _addAccount(req, res, next);
            }
        });
    };

    /** @function
     * @description Updates the existing account by id. The user needs to have permission 'update'.
     * @example
     * curl -X PUT -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data  '{ "name": "mynewaccount", "email": "mynewemail@mail.com" }' -k -v https://127.0.0.1:9999/api/v1/accounts/54688a597129c4c6419c4f76
     * @param {object} req - The request object.
     * @param {object} res - The response object.
     * @param {function} next - The callback function that called next handler in the chain.
     */

    // apidoc engine
    /**
     * @api {put} /accounts/:id Update the existing account
     * @apiVersion 1.0.0
     * @apiName UpdateAccount
     * @apiGroup Accounts
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     *  curl -X PUT -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data '{ "name": "mynewaccount", "email": "mynewemail@mail.com" }' -k -v https://127.0.0.1:9999/api/v1/accounts/54688a597129c4c6419c4f76
     *
     * @apiSuccess {Object} account The updated account
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *          "id": 54688a597129c4c6419c4f76,
     *          "name": "account1",
     *          "email": "email@email.com",
     *          "acl": [],
     *          "created": "2016-02-03T05:00:00.000Z",
     *          "amount": 0,
     *          "removed": false,
     *          "removedDate", ""
     *     }
     *
     * @apiError (Error 5xx) {500} OPERATION_FORBIDDEN Operation is forbidden
     * @apiError (Error 5xx) {500} UNEXPECTED Unexpected error on server side
     * @apiError (Error 5xx) {500} ENT_NOT_FOUND The entity was not found
     * @apiError (Error 5xx) {500} ENT_NOT_UPDATED The entity was not updated
     * @apiError (Error 5xx) {500} ACCOUNT_REMOVED The account was removed
     * @apiError (Error 4xx) {400} BAD_DIGEST The input json value is not correct
     * @apiError (Error 4xx) {400} BAD_DIGEST No data to update
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
     * @apiErrorExample {json} 409 VALIDATION_ERR
     *      HTTP/1.1 409 MissingParameter
     *      {
     *          error: {
     *              code: '',
     *              error_link: https://127.0.0.1:9999/api/v1/409,
     *              message: 'Validation error'
     *              errors: [
     *                  message: 'The name field is empty'
     *              ]
     *          }
     *      }
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
                _updateAccount(req, res, next);
            }
        });
    };

    /** @function
     * @description Removes the existing account by id. The user needs to have permission 'delete'.
     * @example
     * curl -X DELETE -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/accounts/547b689eba9d33302c164b6e
     * @param {object} req - The request object.
     * @param {object} res - The response object.
     * @param {function} next - The callback function that called next handler in the chain.
     */

    // apidoc engine
    /**
     * @api {delete} /accounts/:id Delete the existing account
     * @apiVersion 1.0.0
     * @apiName DeleteAccount
     * @apiGroup Accounts
     *
     * @apiPermission Delete
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X DELETE -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/accounts/547b689eba9d33302c164b6e
     *
     * @apiSuccess {Object} account The empty object
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
                next(errorSupervisorController.createOperationForbiddenError({inputParameters: req.params}));
            } else {
                _delAccount(req, res, next);
            }
        });
    };
};

module.exports = RestApiAccountController;

