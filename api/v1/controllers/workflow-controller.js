'use strict';
/**
 * Created by Alex Levshin on 11/6/16.
 */
var _ = require('lodash');
var moment = require('moment');
var authenticationSupervisorController = require('./supervisor/authentication-controller')();
var workflowSupervisorController = require('./supervisor/workflow-controller')();
var errorSupervisorController = require('./supervisor/error-controller')();
var protocol = rootRequire('shared/protocols/v1/restapi-sv.module').OPERATIONS;
var config = rootRequire('config');

// Constants
var XHttpMethodOverrideHeader = 'x-http-method-override';
var AcceptVersionHeader = 'accept-version';

// TODO:
// - Versioning (see stripe)
//   - aliases latest http://shonzilla/api/v1/customers/1234 -> http://shonzilla/api/customers/1234 with 3xx http code
// - Envelope
// - Caching (restify.conditionalRequest())
var RestApiWorkflowController = function (socket) {
    var _apiFullPath;
    var ResourceName = 'workflows';

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

        server.pre(this.preRoute);

        // Retrieves a list of workflows
        // Retrieve the all workflows mentioning the word 'return' (Filtering & sorting & searching)
        server.get({path: apiFullPath + 'workflows', version: subVersion}, _authenticateByEmail, this.getAll);

        // Retrieves a specific workflow #id
        server.get({path: apiFullPath + 'workflows/:id', version: subVersion}, _authenticateByEmail, this.getById);

        // Creates a new workflow
        server.post({path: apiFullPath + 'workflows', version: subVersion}, _authenticateByEmail, this.add);

        // Updates workflow #id
        server.put({path: apiFullPath + 'workflows/:id', version: subVersion}, _authenticateByEmail, this.update);

        // Deletes workflow #id
        server.del({path: apiFullPath + 'workflows/:id', version: subVersion}, _authenticateByEmail, this.del);

        // Run workflow #id
        server.put({path: apiFullPath + 'workflows/:id/running', version: subVersion}, _authenticateByEmail, this.run);

        // Stop workflow #id
        server.del({path: apiFullPath + 'workflows/:id/running', version: subVersion}, _authenticateByEmail, this.stop);

        // Retrieves list of workties for workflow #id
        server.get({path: apiFullPath + 'workflows/:id/worktiesInstances', version: subVersion}, _authenticateByEmail, this.getAllWorktiesInstances);

        // Retrieves workty #id for workflow #id
        server.get({path: apiFullPath + 'workflows/:id/worktiesInstances/:worktyInstanceId', version: subVersion}, _authenticateByEmail, this.getWorktyInstanceById);

        // Creates a new workty instance in workflow #id
        server.post({path: apiFullPath + 'workflows/:id/worktiesInstances', version: subVersion}, _authenticateByEmail, this.addWorktyInstance);

        // Updates workty instance #id for workflow #id
        server.put({path: apiFullPath + 'workflows/:id/worktiesInstances/:worktyInstanceId', version: subVersion}, _authenticateByEmail, this.updateWorktyInstance);

        // Deletes workty instance #id for workflow #id
        server.del({path: apiFullPath + 'workflows/:id/worktiesInstances/:worktyInstanceId', version: subVersion}, _authenticateByEmail, this.delWorktyInstance);

        // Updates property #id of workty instance #id for workflow #id
        server.put({path: apiFullPath + 'workflows/:id/worktiesInstances/:worktyInstanceId/properties/:propertyId', version: subVersion}, _authenticateByEmail, this.updateWorktyInstanceProperty);

        /*
         // This gets caught, yay!
         server.use(function middlewareError(req, res, next) {
         throw new Error('unexpected middleware error');
         });

         // This works for middleware. Fails for routes.
         server.on('uncaughtException', function (req, res, route, err) {
         loggerController.error(err);
         res.send(err);
         });*/
    };
    this.preRoute = function (req, res, next) {
        // Add support of X-Http-Method-Override: PUT, DELETE using POST
        if (_.contains(_.keys(req.headers), XHttpMethodOverrideHeader) === true) {
            var overrideMethods = ['DELETE', 'PUT'];
            var indexOf = _.indexOf(overrideMethods, req.headers[XHttpMethodOverrideHeader].toUpperCase());
            if (indexOf !== -1) {
                if (req.method.toLowerCase() === 'post') {
                    req.method = overrideMethods[indexOf];
                }
            }
        }

        // Apply accept version in format YYYY.M.D
        if (_.contains(_.keys(req.headers), AcceptVersionHeader) === true) {
            var acceptVersion = req.headers[AcceptVersionHeader];
            try {
                var dateWrapper = moment(new Date(acceptVersion));
                if (dateWrapper.isValid()) {
                    req.headers[AcceptVersionHeader] = dateWrapper.format('YYYY.M.D');
                }
            } catch (e) {
                next(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: req.params}));
            }
        }

        return next();
    };

    // apidoc engine
    /**
     * @api {get} /workflows Get all workflows
     * @apiVersion 1.0.0
     * @apiName GetWorkflows
     * @apiGroup Workflows
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [sort]    The list of field names from workflow model separated by comma that used for sorting
     * @apiParam {String[]} [fields]  The list of field names from workflow model separated by comma that should be included in output result
     * @apiParam {Number}  [page_num=1] The page number that used as a first for pagination
     * @apiParam {Number}  [per_page=10] The number of workflows to send for pagination
     * @apiParam {Number}  [count] The number of sent workflows
     * @apiParam {String[]=worktiesinstances,account,worktiesinstances.state,worktiesinstances.properties,worktiesinstances.workty} [embed] The list of embedded fields
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword'  -H 'accept-version: 2016.3.1' https://127.0.0.1:9999/api/v1/workflows?pretty=true&sort=created
     *
     * @apiSuccess (Success 200) {Object[]} workflows The array of workflows for current account. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      [
     *          {
     *               "id": 54688a597129c4c6419c4f76,
     *               "name": "Worfklow 1",
     *               "desc": "Description 1",
     *               "accountId": 54688a597129c4c6419c4f00,
     *               "worktiesInstancesIds": [54688a597129c4c6419c4100, 54688a597129c4c6419c4200, 54688a597129c4c6419c4300],
     *               "created": "2014-11-23T11:23:00.000Z"
     *          },
     *          {
     *               "id": 54688a597129c4c6419c4f77,
     *               "name": "Worfklow 2",
     *               "desc": "Description 2",
     *               "accountId": 54688a597129c4c6419c4f00,
     *               "worktiesInstancesIds": [54688a597129c4c6419c4101, 54688a597129c4c6419c4201, 54688a597129c4c6419c4301],
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
                        next(errorSupervisorController.createOperationForbiddenError({err: err, inputParameters: req.params}));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;
                        //console.log('[' + new Date() + ']' + ' get all workflows: ' + JSON.stringify(req.params));

                        workflowSupervisorController.getAll(params, function _onAllWorkflowsReturned(err, workflows) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', workflows ? workflows.length : 0);
                                }

                                res.send(workflows);
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
     * @api {get} /workflows/:id Get workflow by id
     * @apiVersion 1.0.0
     * @apiName GetWorkflow
     * @apiGroup Workflows
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [fields]  The list of field names from workflow model separated by comma that should be included in output result
     * @apiParam {String[]=worktiesinstances,account,worktiesinstances.state} [embed] The list of embedded fields
     * @apiParam {Number}  [count] The number of sent workflows
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword'  -H 'accept-version: 2016.3.1' https://127.0.0.1:9999/api/v1/workflows/5465c70e7906b5bb7960f08f
     *
     * @apiSuccess (Success 200) {Object} workflow The workflow. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      {
     *           "id": 5465c70e7906b5bb7960f08f,
     *           "name": "Worfklow 1",
     *           "desc": "Description 1",
     *           "accountId": 54688a597129c4c6419c4f00,
     *           "worktiesInstancesIds": [54688a597129c4c6419c4100, 54688a597129c4c6419c4200, 54688a597129c4c6419c4300],
     *           "created": "2014-11-23T11:23:00.000Z"
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
                        //console.log('[' + new Date() + ']' + ' get workflow by id: '+ JSON.stringify(req.params));

                        workflowSupervisorController.getById(params, function _onWorkflowReturned(err, workflow) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', workflow ? 1 : 0);
                                }

                                res.send(workflow);
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
     * @api {post} /workflows Add the new workflow
     * @apiVersion 1.0.0
     * @apiName AddWorkflow
     * @apiGroup Workflows
     *
     * @apiPermission Create
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -u 'youremail@mail.com':'userpassword'  -H 'Content-type: application/json' --data  '{ "name": "myworkflow", "desc": "workflow" }' -k -v https://127.0.0.1:9999/api/v1/workflows
     *
     * @apiSuccess (Success 201) {Object} workflow The new workflow
     *
     * @apiSuccessExample {json} 201 CREATED
     *     HTTP/1.1 201 Created
     *     {
     *           "id": 5465c70e7906b5bb7960f095,
     *           "name": "myworkflow",
     *           "desc": "workflow",
     *           "accountId": 54688a597129c4c6419c4f00,
     *           "worktiesInstancesIds": [],
     *           "created": "2014-11-23T11:23:00.000Z"
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
                var params = req.params;
                params.accountId = req.accountId;
                //console.log('[' + new Date() + ']' + ' add workflow: ' + JSON.stringify(req.params));

                workflowSupervisorController.add(params, function _onWorkflowAdded(err, workflow) {
                    if (err) {
                        next(err);
                    } else {
                        // Add workflow (send to supervisor)
                        var inputData = {workflow: workflow, accountId: params.accountId};
                        socket.emit(protocol[ResourceName].ADD.name, inputData);

                        res.header('Location', errorSupervisorController.formatLocationHeader(_apiFullPath + 'workflows/' + workflow._id));
                        res.send(201, workflow);
                        next();
                    }
                });
            }
        });
    };

    // apidoc engine
    /**
     * @api {put} /workflows/:id Update the existing workflow
     * @apiVersion 1.0.0
     * @apiName UpdateWorkflow
     * @apiGroup Workflows
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     *  curl -X PUT -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data  '{ "name": "myworkflow", "desc": "workflow" }' -k -v https://127.0.0.1:9999/api/v1/workflows/54688a597129c4c6419c4f76
     *
     * @apiSuccess {Object} workflow The updated workflow
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *           "id": 54688a597129c4c6419c4f76,
     *           "name": "myworkflow",
     *           "desc": "workflow",
     *           "accountId": 54688a597129c4c6419c4f00,
     *           "worktiesInstancesIds": [],
     *           "created": "2014-11-23T11:23:00.000Z"
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
     *              code: 18,
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
                        //console.log('[' + new Date() + ']' + ' update workflow: ' + JSON.stringify(req.params));

                        workflowSupervisorController.update(params, function _onWorkflowUpdated(err, updatedWorkflow) {
                            if (err) {
                                next(err);
                            } else {
                                // Update workflow (send to supervisor)
                                var inputData = {workflow: updatedWorkflow, accountId: params.accountId};
                                socket.emit(protocol[ResourceName].UPD.name, inputData);

                                // Send 200
                                res.send(updatedWorkflow);
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
     * @api {delete} /workflows/:id Delete the existing workflow
     * @apiVersion 1.0.0
     * @apiName DeleteWorkflow
     * @apiGroup Workflows
     *
     * @apiPermission Delete
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X DELETE -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/workflows/547b689eba9d33302c164b6e
     *
     * @apiSuccess {Object} workflow The empty object
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
                next(errorSupervisorController.createOperationForbiddenError({ err: err, inputParameters: req.params }));
            } else {
                let inputData = {};
                inputData.accountId = req.accountId;
                authenticationSupervisorController.hasAccountAdminAclRole(inputData, function _onAccountAdminAclRoleReturned(err, hasRole) {
                    if (err) {
                        next(errorSupervisorController.createOperationForbiddenError({err: err,  inputParameters: req.params}));
                    } else {
                        var params = req.params;
                        params.accountId = req.accountId;
                        params.hasAdminRole = hasRole;

                        workflowSupervisorController.del(params, function _onWorkflowDeleted(err, deletedWorkflow) {
                            if (err) {
                                next(err);
                            } else {
                                // Delete workflow (send to supervisor)
                                var inputData = {workflow: deletedWorkflow, accountId: params.accountId};
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
     * @api {put} /workflows/:id/running Run the existing workflow
     * @apiVersion 1.0.0
     * @apiName RunWorkflow
     * @apiGroup Workflows
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X PUT -u 'youremail@mail.com':'userpassword' -k https://127.0.0.1:9999/api/v1/workflows/547b689eba9d33302c164b6e/running
     *
     * @apiSuccess {Object} workflow The updated workflow
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *           "id": 54688a597129c4c6419c4f76,
     *           "name": "myworkflow",
     *           "desc": "workflow",
     *           "accountId": 54688a597129c4c6419c4f00,
     *           "worktiesInstancesIds": [],
     *           "created": "2014-11-23T11:23:00.000Z"
     *     }
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
    this.run = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].RUN.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({ err: err, inputParameters: req.params }));
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
                        //console.log('[' + new Date() + ']' + ' run workflow: ' + JSON.stringify(req.params));

                        workflowSupervisorController.run(params, function _onWorkflowUpdated(err, updatedWorkflow) {
                            if (err) {
                                next(err);
                            } else {
                                // Run workflow (send to supervisor)
                                var inputData = {
                                    workflow: {id: updatedWorkflow._id.toString()},
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].RUN.name, inputData);

                                // Send 200
                                res.send(updatedWorkflow);
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
     * @api {put} /workflows/:id/pausing Pause the existing workflow
     * @apiVersion 1.0.0
     * @apiName PauseWorkflow
     * @apiGroup Workflows
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X PUT -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f7f/pausing
     *
     * @apiSuccess {Object} workflow The updated workflow
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *           "id": 54688a597129c4c6419c4f76,
     *           "name": "myworkflow",
     *           "desc": "workflow",
     *           "accountId": 54688a597129c4c6419c4f00,
     *           "worktiesInstancesIds": [],
     *           "created": "2014-11-23T11:23:00.000Z"
     *     }
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
    this.pause = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].PAUSE.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({ err: err, inputParameters: req.params }));
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
                        //console.log('[' + new Date() + ']' + ' pause workflow: ' + JSON.stringify(req.params));

                        workflowSupervisorController.pause(params, function _onWorkflowUpdated(err, updatedWorkflow) {
                            if (err) {
                                next(err);
                            } else {
                                // Pause workflow (send to supervisor)
                                var inputData = {
                                    workflow: {id: updatedWorkflow._id.toString()},
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].PAUSE.name, inputData);

                                // Send 200
                                res.send(updatedWorkflow);
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
     * @api {delete} /workflows/:id/running Stop the workflow
     * @apiVersion 1.0.0
     * @apiName StopWorkflow
     * @apiGroup Workflows
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X DELETE -u 'youremail@mail.com':'userpassword'  -k -v https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f7f/running
     *
     * @apiSuccess {Object} workflow The updated workflow
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *           "id": 54688a597129c4c6419c4f76,
     *           "name": "myworkflow",
     *           "desc": "workflow",
     *           "accountId": 54688a597129c4c6419c4f00,
     *           "worktiesInstancesIds": [],
     *           "created": "2014-11-23T11:23:00.000Z"
     *     }
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
    this.stop = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].STOP.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({ err: err, inputParameters: req.params }));
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
                        //console.log('[' + new Date() + ']' + ' stop workflow: ' + JSON.stringify(req.params));

                        workflowSupervisorController.stop(params, function _onWorkflowUpdated(err, updatedWorkflow) {
                            if (err) {
                                next(err);
                            } else {
                                // Stop workflow (send to supervisor)
                                var inputData = {
                                    workflow: {id: updatedWorkflow._id.toString()},
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].STOP.name, inputData);

                                // Send 200
                                res.send(updatedWorkflow);
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
     * @api {get} /workflows/:id/worktiesInstances Get all workties instances for workflow
     * @apiVersion 1.0.0
     * @apiName GetWorktiesInstances
     * @apiGroup Workflows
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [fields]  The list of field names from workty instance model separated by comma that should be included in output result
     * @apiParam {Number}  [page_num=1] The page number that used as a first for pagination
     * @apiParam {Number}  [per_page=10] The number of workties instances to send for pagination
     * @apiParam {Number}  [count] The number of sent workties instances
     * @apiParam {String[]=workflow,workty,state,properties} [embed] The list of embedded fields
     *
     * @apiExample {curl} Example usage:
     *  curl -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f7f/worktiesInstances?pretty=true&sort=created&page_num=1&per_page=3
     *
     * @apiSuccess (Success 200) {Object[]} worktiesInstances The array of workties instances for current account and workflow. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      [
     *          {
     *              "id": 545f9b4e2f82bdb917ad6fa0,
     *              "workflowId": 545f95ee2f82bdb917ad6f7f,
     *              "worktyId": 545f95ee2f82bdb917ad6111,
     *              "name": "myworktyinstance",
     *              "desc": "description",
     *              "stateId": 545f95ee2f82bdb917ad6212,
     *              "propertiesIds": [545f95ee2f82bdb917ad6f70, 545f95ee2f82bdb917ad6f71, 545f95ee2f82bdb917ad6f72],
     *              "created": "2015-11-23T11:45:00.000Z"
     *          },
     *          {
     *              "id": 545f9b4e2f82bdb917ad6fa2,
     *              "workflowId": 545f95ee2f82bdb917ad6f7f,
     *              "worktyId": 545f95ee2f82bdb917ad6112,
     *              "name": "myworktyinstance2",
     *              "desc": "description2",
     *              "stateId": 545f95ee2f82bdb917ad6213,
     *              "propertiesIds": [545f95ee2f82bdb917ad6f73, 545f95ee2f82bdb917ad6f74],
     *              "created": "2015-11-23T13:15:10.000Z"
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
    this.getAllWorktiesInstances = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].REFRESH_ALL_WORKTY_INSTANCES.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({ err: err, inputParameters: req.params }));
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
                        //console.log('[' + new Date() + ']' + ' get workties instances: '+ JSON.stringify(req.params));

                        workflowSupervisorController.getAllWorktiesInstances(params, function _onAllWorktiesInstancesReturned(err, worktiesInstances) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', worktiesInstances ? worktiesInstances.length : 0);
                                }

                                res.send(worktiesInstances);
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
     * @api {get} /workflows/:id/worktiesInstances/:worktyInstanceId Get workty instance for workflow by id
     * @apiVersion 1.0.0
     * @apiName GetWorktyInstance
     * @apiGroup Workflows
     *
     * @apiPermission View
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {Boolean=true,false} [pretty]  The prettify flag for output result
     * @apiParam {String[]} [fields]  The list of field names from workty instance model separated by comma that should be included in output result
     * @apiParam {String[]=workflow,worktyinstance,state,properties} [embed] The list of embedded fields
     * @apiParam {Number}  [count] The number of sent worties instances
     *
     * @apiExample {curl} Example usage:
     *  curl -k -v -u 'youremail@mail.com':'userpassword' https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f83/worktiesInstances/545f9b4e2f82bdb917ad6fa3
     *
     * @apiSuccess (Success 200) {Object} worktyInstance The workty instance. It can be empty
     *
     * @apiSuccessExample {json} 200 OK
     *      HTTP/1.1 200 OK
     *      {
     *          "id": 545f9b4e2f82bdb917ad6fa3,
     *          "workflowId": 545f95ee2f82bdb917ad6f83,
     *          "worktyId": 545f9b4e2f82bdb917ad6fa0,
     *          "name": "myworktyinstance2",
     *          "desc": "description2",
     *          "stateId": 545f95ee2f82bdb917ad6213,
     *          "propertiesIds": [545f95ee2f82bdb917ad6f73, 545f95ee2f82bdb917ad6f74],
     *          "created": "2015-11-23T13:15:10.000Z"
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
    this.getWorktyInstanceById = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].REFRESH_WORKTY_INSTANCE.permissionName;
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
                        //console.log('[' + new Date() + ']' + ' get workty instance by id: '+ JSON.stringify(req.params));

                        workflowSupervisorController.getWorktyInstanceById(params, function _onWorktyInstanceReturned(err, worktyInstance) {
                            if (err) {
                                next(err);
                            } else {
                                if (params.count && params.count === 'true') {
                                    res.header('Records-count', worktyInstance ? 1 : 0);
                                }

                                res.send(worktyInstance);
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
     * @api {post} /workflows/:id/worktiesInstances Add the new workty instance into workflow
     * @apiVersion 1.0.0
     * @apiName AddWorktyInstance
     * @apiGroup Workflows
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {String=first,last} [position_type]  The position type that used to insert new workty instance into workflow.
     *                                                First - inserts new workty instance at the first position, position_index/id are ignored.
     *                                                Last - inserts new workty instance at the last position, position_index/id are ignored.
     * @apiParam {Number} [position_index]  The position index that used to insert new workty instance into workflow. Inserts new workty instance on N position index (shifted right), where N = 0...last - 1.
     * @apiParam {Guid} [position_id]  The id of existing workty instance that used to insert new workty instance into workflow. Inserts new workty instance on the index of workty with id (shifted right).
     * @apiParam {String[]=workflow,workty,state,properties} [embed] The list of embedded fields
     *
     * @apiExample {curl} Example usage:
     * curl -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data '{ "name": "newworktyinstance", "desc": "newworktydesc", "worktyId": "225f95ee2f82bdb917ad3565" }' -k -v https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f81/worktiesInstances?position_type=first
     *
     * @apiSuccess (Success 201) {Object} worktyInstance The new workty instance
     *
     * @apiSuccessExample {json} 201 CREATED
     *     HTTP/1.1 201 Created
     *     {
     *            "id": 545f9b4e2f82bdb917ad6fa3,
     *            "workflowId": 545f95ee2f82bdb917ad6f81,
     *            "worktyId": 225f95ee2f82bdb917ad3565,
     *            "name": "newworktyinstance",
     *            "desc": "newworktydesc",
     *            "stateId": 545f95ee2f82bdb917ad6213,
     *            "propertiesIds": [],
     *            "created": "2015-11-23T13:15:10.000Z"
     *     }
     *
     * @apiError (Error 5xx) {500} OPERATION_FORBIDDEN Operation is forbidden
     * @apiError (Error 5xx) {500} UNEXPECTED Unexpected error on server side
     * @apiError (Error 5xx) {500} ENT_NOT_FOUND The entity was not found
     * @apiError (Error 5xx) {500} ENT_NOT_SAVED The entity was not saved
     * @apiError (Error 5xx) {500} POSITION_IDX_INVALID Position index is invalid
     * @apiError (Error 5xx) {500} POSITION_ID_INVALID Position id is invalid
     * @apiError (Error 5xx) {500} POSITION_TYPE_INVALID Wrong position type value, allowed values are first, last, after, before
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
     * @apiErrorExample {json} 500 POSITION_IDX_INVALID
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 10,
     *              error_link: https://127.0.0.1:9999/api/v1/10,
     *              message: 'Position index is invalid'
     *          }
     *      }
     * @apiErrorExample {json} 500 POSITION_ID_INVALID
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 11,
     *              error_link: https://127.0.0.1:9999/api/v1/11,
     *              message: 'Position id is invalid'
     *          }
     *      }
     * @apiErrorExample {json} 500 POSITION_TYPE_INVALID
     *      HTTP/1.1 500 InternalError
     *      {
     *          error: {
     *              code: 12,
     *              error_link: https://127.0.0.1:9999/api/v1/12,
     *              message: 'Wrong position type value, allowed values: first, last'
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
    this.addWorktyInstance = function (req, res, next) {
        if (!req.is('application/json') && !req.is('json')) {
            // send 400
            return next(errorSupervisorController.createInputJsonIsInvalid({inputParameters: req.params}));
        }

        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].ADD_WORKTY_INSTANCE.permissionName;
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
                        //console.log('[' + new Date() + ']' + ' add workty instance: ' + JSON.stringify(req.params));

                        workflowSupervisorController.addWorktyInstance(params, function _onWorktyInstanceAdded(err, addedWorktyInstance) {
                            if (err) {
                                next(err);
                            } else {
                                // Add workty instance (send to supervisor)
                                var inputData = {
                                    workflow: {id: params.id, worktyInstance: addedWorktyInstance},
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].ADD_WORKTY_INSTANCE.name, inputData);

                                res.header('Location', errorSupervisorController.formatLocationHeader(_apiFullPath + 'workflows/' + params.id + "/worktiesInstances/" + addedWorktyInstance._id));
                                res.send(201, addedWorktyInstance);
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
     * @api {put} /workflows/:id/worktiesInstances/:worktyInstanceId Update the existing workty instance
     * @apiVersion 1.0.0
     * @apiName UpdateWorktyInstance
     * @apiGroup Workflows
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     * @apiParam {String=first,last} [position_type]  The position type that used to insert new workty instance into workflow
     *                                                First - inserts new workty instance at the first position, position_index/id are ignored
     *                                                Last - inserts new workty instance at the last position, position_index/id are ignored
     * @apiParam {Number} [position_index]  The position index that used to insert new workty instance into workflow. Inserts new workty instance on N position index (shifted right), where N = 0...last - 1
     * @apiParam {Guid} [position_id]  The id of existing workty instance that used to insert new workty instance into workflow. Inserts new workty instance on the index of workty with id (shifted right)
     * @apiParam {String[]=state} [embed] The list of embedded fields
     *
     * @apiExample {curl} Example usage:
     * curl -X PUT -u 'youremail@mail.com':'userpassword'  -H 'Content-type: application/json' --data  '{ "name": "mynewworktyinstance", "desc": "mynewworktydesc", }' -k -v https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f81/worktiesInstances/5468b5142b6f8d5556db5f82
     *
     * @apiSuccess (Success 200) {Object} worktyInstance The updated workty instance
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *            "id": 5468b5142b6f8d5556db5f82,
     *            "workflowId": 545f95ee2f82bdb917ad6f81,
     *            "worktyId": 225f95ee2f82bdb917ad3565,
     *            "name": "mynewworktyinstance",
     *            "desc": "mynewworktydesc",
     *            "stateId": 545f95ee2f82bdb917ad6213,
     *            "propertiesIds": [],
     *            "created": "2015-11-23T13:15:10.000Z"
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
     *                  message: 'Path `worktyId` is required.'
     *              ]
     *          }
     *      }
     */
    this.updateWorktyInstance = function (req, res, next) {
        if (!req.is('application/json') && !req.is('json')) {
            // send 400
            return next(errorSupervisorController.createInvalidContentError({inputParameters: req.params}));
        }

        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].UPD_WORKTY_INSTANCE.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({ err: err, inputParameters: req.params }));
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
                        //console.log('[' + new Date() + ']' + ' update workty instance: ' + JSON.stringify(req.params));

                        workflowSupervisorController.updateWorktyInstance(params, function _onWorktyInstanceUpdated(err, updatedWorktyInstance) {
                            if (err) {
                                next(err);
                            } else {
                                // Update workty instance (send to supervisor)
                                var inputData = {
                                    workflow: {id: params.id, worktyInstance: updatedWorktyInstance},
                                    accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].UPD_WORKTY_INSTANCE.name, inputData);

                                // send 200
                                res.send(updatedWorktyInstance);
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
     * @api {delete} /workflows/:id/worktiesInstances/:worktyInstanceId Delete the existing workty instance
     * @apiVersion 1.0.0
     * @apiName DeleteWorktyInstance
     * @apiGroup Workflows
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X DELETE -u 'youremail@mail.com':'userpassword' -k -v https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f81/worktiesInstance/5468b29f75efbc095535f705
     *
     * @apiSuccess {Object} worktyInstance The empty object
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
    this.delWorktyInstance = function (req, res, next) {
        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].DEL_WORKTY_INSTANCE.permissionName;
        data.resourceName = ResourceName;

        authenticationSupervisorController.isAclPermissionAllowed(data, function _onOperationAllowed(err, permissionsAllowed) {
            if (err) {
                next(errorSupervisorController.createOperationForbiddenError({ err: err, inputParameters: req.params }));
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
                        //console.log('[' + new Date() + ']' + ' delete workty instance: ' + JSON.stringify(req.params));

                        workflowSupervisorController.delWorktyInstance(params, function _onWorktyInstanceDeleted(err, workflow) {
                            if (err) {
                                next(err);
                            } else {
                                // Delete workty instance (send to supervisor)
                                var inputData = {
                                    workflow: {
                                        id: params.id,
                                        worktyInstance: {id: params.worktyInstanceId}
                                    }, accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].DEL_WORKTY_INSTANCE.name, inputData);

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
     * @api {put} /workflows/:id/worktiesInstances/:worktyInstanceId/properties/:propertyId Update the existing workty instance property
     * @apiVersion 1.0.0
     * @apiName UpdateWorktyInstance
     * @apiGroup Workflows
     *
     * @apiPermission Update
     *
     * @apiHeader {String} [accept-version] The subversion value
     * @apiHeader {String} Content-type application/json
     * @apiHeader {String} useremail:userpassword The user email and password values for authorization
     *
     * @apiExample {curl} Example usage:
     * curl -X PUT -u 'youremail@mail.com':'userpassword' -H 'Content-type: application/json' --data '{ name: "myproperty", value: "mypropertyvalue" }' -k -v https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f81/worktiesInstances/5468b5142b6f8d5556db5f82/properties/55210867e7e1583c5f4c7939
     *
     * @apiSuccess (Success 200) {Object} worktyInstanceProperty The updated workty instance property
     *
     * @apiSuccessExample {json} 200 OK
     *     HTTP/1.1 200 OK
     *     {
     *            "id": 55210867e7e1583c5f4c7939,
     *            "name": "myproperty",
     *            "desc": "mypropertyvalue"
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
     */
    this.updateWorktyInstanceProperty = function (req, res, next) {
        if (!req.is('application/json') && !req.is('json')) {
            // send 400
            return next(errorSupervisorController.createInvalidContentError({inputParameters: req.params}));
        }

        var data = {};
        data.accountId = req.accountId;
        data.permissionName = protocol[ResourceName].UPD_WORKTY_INSTANCE_PROPERTY.permissionName;
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
                        //console.log('[' + new Date() + ']' + ' update workty instance property: ' + JSON.stringify(params));

                        workflowSupervisorController.updateWorktyInstanceProperty(params, function _onWorktyInstancePropertyUpdated(err, updatedWorktyInstanceProperty) {
                            if (err) {
                                next(err);
                            } else {
                                // Update workty instance property (send to supervisor)
                                var inputData = {
                                    workflow: {
                                        id: params.workflowId,
                                        worktyInstance: {
                                            id: params.worktyInstanceId,
                                            property: updatedWorktyInstanceProperty
                                        }
                                    }, accountId: params.accountId
                                };
                                socket.emit(protocol[ResourceName].UPD_WORKTY_INSTANCE_PROPERTY.name, inputData);

                                // send 200
                                res.send(updatedWorktyInstanceProperty);
                                next();
                            }
                        });
                    }
                });
            }
        });
    };
};

module.exports = RestApiWorkflowController;

