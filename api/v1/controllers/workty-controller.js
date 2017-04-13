'use strict';
/**
 * Created by Alex Levshin on 11/6/16.
 */
var _ = require('lodash');
var moment = require('moment');
var errorSupervisorController = require('./supervisor/error-controller')();
var worktySupervisorController = require('./supervisor/workty-controller')();
var authenticationSupervisorController = require('./supervisor/authentication-controller')();
var protocol = rootRequire('shared/protocols/v1/restapi-sv.module').OPERATIONS;
var config = rootRequire('config');

var RestApiWorktyController = function (socket) {
    var _apiFullPath;
    var ResourceName = 'workties';

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

        // Retrieves a list of workties
        // Retrieve the all workties mentioning the word 'return' (Filtering & sorting & searching)
        server.get({ path: apiFullPath + 'workties', version: subVersion}, _authenticateByEmail, this.getAll);

        // Retrieves a specific workty #id
        server.get({ path: apiFullPath + 'workties/:id', version: subVersion}, _authenticateByEmail, this.getById);

        // Creates a new workty
        server.post({ path: apiFullPath + 'workties', version: subVersion }, _authenticateByEmail, this.add);

        // Updates workty #id
        server.put({ path: apiFullPath + 'workties/:id', version: subVersion }, _authenticateByEmail, this.update);

        // Deletes workty #id
        server.del({ path: apiFullPath + 'workties/:id', version: subVersion }, _authenticateByEmail, this.del);

        // Creates a new parameter #id for workty #id
        server.post({ path: apiFullPath + 'workties/:id/properties', version: subVersion }, _authenticateByEmail, this.addParameter);

        // Updates parameter #id for workty #id
        server.put({ path: apiFullPath + 'workties/:id/properties/:propertyId', version: subVersion }, _authenticateByEmail, this.updateParameter);

        // Deletes parameter #id for workty #id
        server.del({ path: apiFullPath + 'workties/:id/properties/:propertyId', version: subVersion }, _authenticateByEmail, this.delParameter);
    };

    // apidoc engine
    /**
     * @api {get} /workties Get all workties
     * @apiVersion 1.0.0
     * @apiName GetWorkties
     * @apiGroup Workties
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [sort]    The list of field names from workty model separated by comma that used for sorting
     * @apiParam {String[]} [fields]  The list of field names from workty model separated by comma that should be included in output result
     * @apiParam {Number}  [page_num=1] The page number that used as a first for pagination
     * @apiParam {Number}  [per_page=10] The number of workties to send for pagination
     * @apiParam {Number}  [count] The number of sent workties
     * @apiParam {String[]=account,properties,type,category,languagetype,validationstate} [embed] The list of embedded fields
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword' -H 'accept-version: 2016.3.1' https://127.0.0.1:9999/api/v1/workties?pretty=true&sort=created
     *
     * @apiSuccess (Success 200) {Object[]} workties The array of workties for current account. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      [
     *          {
     *               "id": 5465c70e7906b5bb7960f08f,
     *               "name": "generic",
     *               "desc": "generic workty",
     *               "accountId": 54688a597129c4c6419c89dd,
     *               "typeId": 54688a597129c4c6419c89ee,
     *               "created": "2014-11-23T11:45:00.000Z",
     *               "categoryId": 54688a597129c4c6419c89dd,
     *               "languageTypeId": 54688a597129c4c6419c59aa,
     *               "validationStateId": 54688a597129c4c6419c4201,
     *               "entryPointModuleFileName": "app.js",
     *               "compressedCode": 0FA5671888A,
     *               "propertiesIds": [],
     *               "price": 0,
     *               "discountPercent": 0
     *          },
     *          {
     *              "id": 5465c70e7906b5bb7960f08f,
     *               "name": "encrypt pdf file",
     *               "desc": "encrypt pdf file workty",
     *               "accountId": 54688a597129c4c6419c89dd,
     *               "typeId": 54688a597129c4c6419c89ee,
     *               "created": "2014-12-26T10:45:10.000Z",
     *               "categoryId": 54688a597129c4c6419c89dd,
     *               "languageTypeId": 54688a597129c4c6419c59aa,
     *               "validationStateId": 54688a597129c4c6419c4201,
     *               "entryPointModuleFileName": "app.js",
     *               "compressedCode": 0FA5671888A,
     *               "propertiesIds": [],
     *               "price": 0,
     *               "discountPercent": 0
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
                        //console.log('[' + new Date() + ']' + ' get all workties: '+ JSON.stringify(req.params));

                        worktySupervisorController.getAll(params, function _onAllWorktiesReturned(err, workties) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', workties ? workties.length : 0);
                                }

                                // Send 200
                                res.send(workties);
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
     * @api {get} /workties/:id Get workty by id
     * @apiVersion 1.0.0
     * @apiName GetWorkty
     * @apiGroup Workties
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [fields]  The list of field names from workty model separated by comma that should be included in output result
     * @apiParam {String[]=account,properties,type,category,languagetype,validationstate} [embed] The list of embedded fields
     * @apiParam {Number}  [count] The number of sent workties
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword'  -H 'accept-version: 2016.3.1' https://127.0.0.1:9999/api/v1/workties/5465c70e7906b5bb7960f08f
     *
     * @apiSuccess (Success 200) {Object} workty The workty. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      {
     *          "id": 5465c70e7906b5bb7960f08f,
     *          "name": "generic",
     *          "desc": "generic workty",
     *          "accountId": 54688a597129c4c6419c89dd,
     *          "typeId": 54688a597129c4c6419c89ee,
     *          "created": "2014-11-23T11:45:00.000Z",
     *          "categoryId": 54688a597129c4c6419c89dd,
     *          "languageTypeId": 54688a597129c4c6419c59aa,
     *          "validationStateId": 54688a597129c4c6419c4201,
     *          "entryPointModuleFileName": "app.js",
     *          "compressedCode": 0FA5671888A,
     *          "propertiesIds": [],
     *          "price": 0,
     *          "discountPercent": 0
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
                        //console.log('[' + new Date() + ']' + ' get workty by id: '+ JSON.stringify(req.params));

                        worktySupervisorController.getById(params, function _onWorktyReturned(err, workty) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', workty ? 1 : 0);
                                }

                                // Send 200
                                res.send(workty);
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
     * @api {post} /workties Add the new workty
     * @apiVersion 1.0.0
     * @apiName AddWorkty
     * @apiGroup Workties
     *
     * @apiPermission Create
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data '{ "name": "myworkty", "desc": "workty" }' -k -v https://127.0.0.1:9999/api/v1/workties
     *
     * @apiSuccess (Success 201) {Object} workty The new workty
     *
     * @apiSuccessExample {json} 201 CREATED
     *     HTTP/1.1 201 Created
     *     {
     *           "id": 5465c70e7906b5bb7960f08f,
     *           "name": "generic",
     *           "desc": "generic workty",
     *           "accountId": 54688a597129c4c6419c89dd,
     *           "typeId": 54688a597129c4c6419c89ee,
     *           "created": "2014-11-23T11:45:00.000Z",
     *           "categoryId": 54688a597129c4c6419c89dd,
     *           "languageTypeId": 54688a597129c4c6419c59aa,
     *           "validationStateId": 54688a597129c4c6419c4201,
     *           "entryPointModuleFileName": "app.js",
     *           "compressedCode": 0FA5671888A,
     *           "propertiesIds": [],
     *           "price": 0,
     *           "discountPercent": 0
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
     *                  message: 'Path `name` is required.'
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
                let inputData = {};
                inputData.accountId = req.accountId;
                authenticationSupervisorController.hasAccountAdminAclRole(inputData, function _onAccountAdminAclRoleReturned(err, hasRole) {
                    if (err) {
                        next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;
                        //console.log('[' + new Date() + ']' + ' add workty: ' + JSON.stringify(params));

                        worktySupervisorController.add(params, function _onWorktyAdded(err, workty) {
                            if (err) {
                                next(err);
                            } else {
                                // Add workty (send to supervisor)
                                var inputData = {workty: workty, accountId: params.accountId};
                                socket.emit(protocol[ResourceName].ADD.name, inputData);

                                res.header('Location', errorSupervisorController.formatLocationHeader(_apiFullPath + 'workties/' + workty._id));
                                res.send(201, workty);
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
     * @api {put} /workties/:id Update the existing workty
     * @apiVersion 1.0.0
     * @apiName UpdateWorkty
     * @apiGroup Workties
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     *  curl -X PUT -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data  '{ "name": "myworkty", "desc": "worktydesc" }' -k -v https://127.0.0.1:9999/api/v1/workties/545f95ee2f82bdb917ad6f81
     *
     * @apiSuccess {Object} workty The updated workty
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *           "id": 545f95ee2f82bdb917ad6f81,
     *           "name": "myworkty",
     *           "desc": "worktydesc",
     *           "accountId": 54688a597129c4c6419c89dd,
     *           "typeId": 54688a597129c4c6419c89ee,
     *           "created": "2014-11-23T11:45:00.000Z",
     *           "categoryId": 54688a597129c4c6419c89dd,
     *           "languageTypeId": 54688a597129c4c6419c59aa,
     *           "validationStateId": 54688a597129c4c6419c4201,
     *           "entryPointModuleFileName": "app.js",
     *           "compressedCode": 0FA5671888A,
     *           "propertiesIds": [],
     *           "price": 0,
     *           "discountPercent": 0
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
                let inputData = {};
                inputData.accountId = req.accountId;
                authenticationSupervisorController.hasAccountAdminAclRole(inputData, function _onAccountAdminAclRoleReturned(err, hasRole) {
                    if (err) {
                        next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;
                        //console.log('[' + new Date() + ']' + ' update workty: ' + JSON.stringify(req.params));

                        worktySupervisorController.update(params, function _onWorktyUpdated(err, updatedWorkty) {
                            if (err) {
                                next(err);
                            } else {
                                // Update workty (send to supervisor)
                                var inputData = {workty: updatedWorkty, accountId: params.accountId};
                                socket.emit(protocol[ResourceName].UPD.name, inputData);

                                // send 200
                                res.send(updatedWorkty);
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
     * @api {delete} /workties/:id Delete the existing workty
     * @apiVersion 1.0.0
     * @apiName DeleteWorkty
     * @apiGroup Workties
     *
     * @apiPermission Delete
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X DELETE -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/workties/545f95ee2f82bdb917ad6f81
     *
     * @apiSuccess {Object} workty The empty object
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
                        //console.log('[' + new Date() + ']' + ' delete workty: ' + JSON.stringify(req.params));

                        worktySupervisorController.del(params, function _onWorktyDeleted(err, workty) {
                            if (err) {
                                next(err);
                            } else {
                                // Delete workty (send to supervisor)
                                var inputData = {workty: workty, accountId: params.accountId};
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

    // apidoc engine
    /**
     * @api {post} /workties/:id/properties Add the new workty property
     * @apiVersion 1.0.0
     * @apiName AddWorktyProperty
     * @apiGroup Workties
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data '{ "property": { "name": "myworktyparameter", "value": "some value" }}' -k -v https://127.0.0.1:9999/api/v1/workties/545f95ee2f82bdb917ad6f81/properties
     *
     * @apiSuccess (Success 201) {Object} worktyProperty The new workty property
     *
     * @apiSuccessExample {json} 201 CREATED
     *     HTTP/1.1 201 Created
     *     {
     *           "id": 5465c70e7906b5bb7960f08f,
     *           "name": "myworktyparameter",
     *           "value": "some value"
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
     *                  message: 'Path `name` is required.'
     *              ]
     *          }
     *      }
     */
    this.addParameter = function (req, res, next) {
        if (!req.is('application/json') && !req.is('json')) {
            // send 400
            return next(errorSupervisorController.createInvalidContentError({inputParameters: req.params}));
        }

        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].ADD_PROPERTY.permissionName;
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
                        params.property = req.params.property || {};
                        //console.log('[' + new Date() + ']' + ' add workty property: ' + JSON.stringify(req.params));

                        worktySupervisorController.addProperty(params, function _onWorktyPropertyAdded(err, addedWorktyProperty) {
                            if (err) {
                                next(err);
                            } else {
                                // Add workty property (send to supervisor)
                                var inputData = {
                                    workty: {id: params.id, property: addedWorktyProperty},
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].ADD_PROPERTY.name, inputData);

                                res.header('Location', errorSupervisorController.formatLocationHeader(_apiFullPath + 'workties/' + params.id + '/properties/' + addedWorktyProperty._id));
                                res.send(201, addedWorktyProperty);
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
     * @api {put} /workties/:id/properties/:propertyId Update the existing workty property
     * @apiVersion 1.0.0
     * @apiName UpdateWorktyProperty
     * @apiGroup Workties
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password valuess for authorization
     * @apiParam {String[]=state} [embed] The list of embedded fields
     *
     * @apiExample {curl} Example usage:
     * curl -X PUT -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data  '{ "property": { "name": "mynewworkty", "value": "some new value" }}' -k -v https://127.0.0.1:9999/api/v1/workties/545f95ee2f82bdb917ad6f81/properties/545f95ee2f82bdb917ad44f2
     *
     * @apiSuccess (Success 200) {Object} worktyProperty The updated workty property
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *           "id": 545f95ee2f82bdb917ad44f2,
     *           "name": "mynewworkty",
     *           "value": "some new value"
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
     *              error_link: https://127.0.0.1:9999/api/v1/5,
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
     *                  message: 'Path `name` is required.'
     *              ]
     *          }
     *      }
     */
    this.updateParameter = function (req, res, next) {
        if (!req.is('application/json') && !req.is('json')) {
            // send 400
            return next(errorSupervisorController.createInvalidContentError({inputParameters: req.params}));
        }

        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].UPD_PROPERTY.permissionName;
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
                        if (params.property) {
                            params.property.id = req.params.propertyId || '';
                        } else {
                            params.property = {};
                        }
                        //console.log('[' + new Date() + ']' + ' update workty property: ' + JSON.stringify(req.params));

                        worktySupervisorController.updateProperty(params, function _onWorktyPropertyUpdated(err, updatedWorktyProperty) {
                            if (err) {
                                next(err);
                            } else {
                                // Update workty property (send to supervisor)
                                var inputData = {
                                    workty: {id: params.id, property: updatedWorktyProperty},
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].UPD_PROPERTY.name, inputData);

                                // send 200
                                res.send(updatedWorktyProperty);
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
     * @api {delete} /workties/:id/properties/:propertyId Delete the existing workty property
     * @apiVersion 1.0.0
     * @apiName DeleteWorktyProperty
     * @apiGroup Workties
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X DELETE -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/workties/545f95ee2f82bdb917ad6f81/properties/545f95ee2f82bdb917ad44f2
     *
     * @apiSuccess {Object} worktyProperty The empty object
     *
     * @apiSuccessExample {json} 204 NO_CONTENT
     *      HTTP/1.1 204
     *      {
     *      }
     *
     * @apiError (Error 5xx) {500} OPERATION_FORBIDDEN Operation is forbidden
     * @apiError (Error 5xx) {500} UNEXPECTED Unexpected error on server side
     * @apiError (Error 5xx) {500} ENT_NOT_FOUND The entity was not found
     * @apiError (Error 5xx) {500} ENT_NOT_UPDATED The entity was not updated
     * @apiError (Error 5xx) {500} ENT_NOT_DELETED The entity was not deleted
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
     * @apiErrorExample {json} 500 ENT_NOT_UPDATED
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 3,
     *              error_link: https://127.0.0.1:9999/api/v1/3,
     *              message: 'The entity was not updated'
     *          }
     *      }
     * @apiErrorExample {json} 500 ENT_NOT_DELETED
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 4,
     *              error_link: https://127.0.0.1:9999/api/v1/4,
     *              message: 'The entity was not deleted'
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
    this.delParameter = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        // delete permission is only for parent workty object
        data.permissionName = protocol[ResourceName].DEL_PROPERTY.permissionName;
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
                        params.property = {id: req.params.propertyId || ''};
                        //console.log('[' + new Date() + ']' + ' delete workty property: ' + JSON.stringify(req.params));

                        worktySupervisorController.delProperty(params, function _onWorktyPropertyDeleted(err, deletedWorktyProperty) {
                            if (err) {
                                next(err);
                            } else {
                                // Delete workty property (send to supervisor)
                                var inputData = {
                                    workty: {id: params.id, property: deletedWorktyProperty},
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].DEL_PROPERTY.name, inputData);

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

module.exports = RestApiWorktyController;

