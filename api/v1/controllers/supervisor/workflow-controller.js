'use strict';
/**
 * Created by Alex Levshin on 11/6/16.
 */
var _ = require('lodash');
var WorkflowModel = require('../../models/workflow').defaultModel;
var WorktyInstanceModel = require('../../models/workty-instance').defaultModel;
var WorktyInstanceStateModel = require('../../models/workty-instance-state').defaultModel;
var WorktyPropertyModel = require('../../models/workty-property').defaultModel;
var WorktyModel = require('../../models/workty').defaultModel;
var mongoose = require('mongoose');
var util = require('util');
require('mongoose-when');
var MPromise = mongoose.Promise;
var errorSupervisorController = require('./error-controller')();
var Q = require('q');
var PerPageItems = 10;
var MinPageItems = 0;
var MaxPageItems = 250;

var SupervisorWorkflowController = function() {

    return {
        getAll: function (data, cb) {
            var params = data;
            var findCriteria = {};
            var excludeKeys = ['sort', 'fields', 'count', 'pretty', 'page_num', 'per_page', 'embed'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === true) {
                    excludeKeys.push('accountId');
                }

                delete params.hasAdminRole;
            }
            var query = WorkflowModel.find(findCriteria);

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

            // Embedding
            if (params.embed) {
                var deepPopulated = [];
                var embedFields = params.embed.split(',');
                _.forEach(embedFields, function _onGetEmbedField(embedField) {
                    var formattedEmbedField = embedField.trim().toLowerCase();
                    if (formattedEmbedField === 'worktiesinstances') {
                        query = query.populate('worktiesInstancesIds');
                    } else if (formattedEmbedField === 'account') {
                        query = query.populate('accountId');
                    } else if (formattedEmbedField === 'worktiesinstances.state') {
                        deepPopulated.push('worktiesInstancesIds.stateId');
                    } else if (formattedEmbedField === 'worktiesinstances.properties') {
                        deepPopulated.push('worktiesInstancesIds.propertiesIds');
                    } else if (formattedEmbedField === 'worktiesinstances.workty') {
                        deepPopulated.push('worktiesInstancesIds.worktyId');
                    }
                });

                if (deepPopulated.length > 0) {
                    query = query.deepPopulate(deepPopulated);
                }
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

            query.exec().then(function _onWorkflowsFound(workflows) {
                if (!workflows) {
                    return cb(null, []);
                }

                cb(null, workflows);
            }).end(function _onWorkflowsFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        getById: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var excludeKeys = ['fields', 'pretty', 'embed', 'id', 'count'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === true) {
                    excludeKeys.push('accountId');
                }

                delete params.hasAdminRole;
            }
            var query = WorkflowModel.findOne(findCriteria);

            // Filter
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                query = query.where(key).equals(params[key]);
            });

            // Include/exclude fields in output
            if (params.fields) {
                var fields = params.fields.split(',').join(' ');
                query = query.select(fields);
            }

            // Embedding
            if (params.embed) {
                var embedFields = params.embed.split(',');
                _.forEach(embedFields, function _onGetEmbedField(embedField) {
                    var formattedEmbedField = embedField.trim().toLowerCase();
                    if (formattedEmbedField === 'worktiesinstances') {
                        query = query.populate('worktiesInstancesIds');
                    } else if (formattedEmbedField === 'account') {
                        query = query.populate('accountId');
                    } else if (formattedEmbedField === 'worktiesinstances.state') {
                        query = query.deepPopulate('worktiesInstancesIds.stateId');
                    }
                });
            }

            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(null, {});
                }

                cb(null, workflow);
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        add: function (data, cb) {
            var params = data;

            // Miss promise like style because of need to catch validation error
            var newWorkflow = new WorkflowModel();
            newWorkflow.name = params.name;
            newWorkflow.desc = params.desc || '';
            newWorkflow.accountId = params.accountId;
            newWorkflow.save(function _onWorkflowSaved(err, workflow) {
                if (err) {
                    if (err.name === 'ValidationError') {
                        return cb(errorSupervisorController.createMissingParameterError({validationError: err, inputParameters: data}));
                    }

                    return cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }

                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotSaved({inputParameters: data}));
                }

                cb(null, workflow);
            });
        },
        update: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var updateCriteria = {};
            var excludeKeys = ['id', 'stateId', '_id', 'accountId', 'fields', 'sort', 'count', 'created', 'pretty', 'page_num', 'per_page', 'socket'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            // Update
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                // Need to validate required fields manually because of findOneAndUpdate skip it
                switch (key) {
                    case 'name': {
                       if (!params[key]) {
                           var err = {
                               errors: {
                                   name: {
                                       message: 'Path `name` is required.'
                                   }
                               }
                           };

                           return cb(errorSupervisorController.createMissingParameterError({validationError: err, inputParameters: data}));
                       } else {
                           updateCriteria[key] = params[key];
                       }
                    }
                    break;
                    case 'worktiesInstances': {
                        // Update them later
                    }
                    break;
                    default: {
                        updateCriteria[key] = params[key];
                    }
                }
            });

            if (Object.keys(updateCriteria).length === 0 && !_.has(params, 'worktiesInstances')) {
                return cb(errorSupervisorController.createBadDigestError({inputParameters: data}));
            }

            var query = WorkflowModel.findOneAndUpdate(findCriteria, updateCriteria, {'new': true});
            if (_.has(params, 'worktiesInstances')) {
                query = query.populate('worktiesInstancesIds');
            }

            query.exec().then(function _onWorkflowFoundAndUpdated(updatedWorkflow) {
                if (!updatedWorkflow) {
                    return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                }

                var workflowChanged = false;

                // Update workties instances
                if (_.has(params, 'worktiesInstances')) {
                    var worktiesInstances = params.worktiesInstances;

                    if (worktiesInstances.length > 0) {
                        findCriteria = {workflowId: params.id};
                        updateCriteria = {};

                        _.forEach(worktiesInstances, function _onEachWorktyInstance(worktyInstance) {
                            var wi = _.find(updatedWorkflow.worktiesInstancesIds, function(worktyInstanceId) {
                                return worktyInstanceId._id.equals(worktyInstance.id);
                            });

                            if (wi) {
                                var newStateId = WorktyInstanceStateModel.findByName(worktyInstance.state)._id;
                                if (!wi.stateId.equals(newStateId)) {
                                    findCriteria._id = worktyInstance.id;
                                    updateCriteria.stateId = newStateId;
                                    workflowChanged = true;
                                }
                            }
                        });

                        if (workflowChanged) {
                            query = WorktyInstanceModel.findOneAndUpdate(findCriteria, {'$set': updateCriteria}, {'new': true});
                            query.exec().then(function _onWorkflowFoundAndUpdated(updatedWorktyInstance) {
                                if (!updatedWorktyInstance) {
                                    return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                                }

                                cb(null, updatedWorkflow);
                            }).end(function _onWorkflowFoundAndUpdatedError(err) {
                                if (err) {
                                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                                }
                            });
                        }
                    }
                }

                if (workflowChanged === false) {
                    cb(null, updatedWorkflow);
                }
            }).end(function _onWorkflowFoundAndUpdatedError(err) {
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

            var query = WorkflowModel.findOne(findCriteria);
            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotDeleted({ inputParameters: data }));
                }

                workflow.remove();

                cb(null, workflow);
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        run: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = WorkflowModel.findOne(findCriteria);
            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                }

                // Send workflow to web client
                cb(null, workflow);
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        pause: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = WorkflowModel.findOne(findCriteria);
            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                }

                // Send workflow to web client
                cb(null, workflow);
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        stop: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = WorkflowModel.findOne(findCriteria);
            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                }

                // Send workflow to web client
                cb(null, workflow);
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        getAllWorktiesInstances: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }
            var query = WorkflowModel.findOne(findCriteria);

            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                }

                findCriteria = {workflowId: workflow._id};
                var query = WorktyInstanceModel.find(findCriteria);

                // Include/exclude fields in output
                if (params.fields) {
                    var fields = params.fields.split(',').join(' ');
                    query = query.select(fields);
                }

                // Embedding
                if (params.embed) {
                    var embedFields = params.embed.split(',');
                    _.forEach(embedFields, function _onGetEmbedField(embedField) {
                        var formattedEmbedField = embedField.trim().toLowerCase();
                        if (formattedEmbedField === 'workflow') {
                            query = query.populate('workflowId');
                        } else if (formattedEmbedField === 'worktyinstance') {
                            query = query.populate('worktyId');
                        } else if (formattedEmbedField === 'state') {
                            query = query.populate('stateId');
                        } else if (formattedEmbedField === 'properties') {
                            query = query.populate('propertiesIds');
                        }
                    });
                }

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

                return query.exec();
            }).then(function _onWorktiesInstancesFound(worktiesInstances) {
                if (!worktiesInstances) {
                    cb(null, []);
                } else {
                    cb(null, worktiesInstances);
                }
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        getWorktyInstanceById: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }
            var query = WorkflowModel.findOne(findCriteria);

            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                }

                findCriteria = { _id: params.worktyInstanceId };
                var query = WorktyInstanceModel.findOne(findCriteria);

                // Include/exclude fields in output
                if (params.fields) {
                    var fields = params.fields.split(',').join(' ');
                    query = query.select(fields);
                }

                // Embedding
                if (params.embed) {
                    var embedFields = params.embed.split(',');
                    _.forEach(embedFields, function _onGetEmbedField(embedField) {
                        var formattedEmbedField = embedField.trim().toLowerCase();
                        if (formattedEmbedField === 'workflow') {
                            query = query.populate('workflowId');
                        } else if (formattedEmbedField === 'worktyinstance') {
                            query = query.populate('worktyId');
                        } else if (formattedEmbedField === 'state') {
                            query = query.populate('stateId');
                        } else if (formattedEmbedField === 'properties') {
                            query = query.populate('propertiesIds');
                        }
                    });
                }

                return query.exec();
            }).then(function _onWorktyInstanceFound(worktyInstance) {
                cb(null, worktyInstance);
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        addWorktyInstance: function (data, cb) {
            if (!data.worktyId) {
                var err = {
                    errors: {
                        name: {
                            message: 'Path `worktyId` is required.'
                        }
                    }
                };

                return cb(errorSupervisorController.createMissingParameterError({ validationError: err, inputParameters: data }));
            }

            var params = data;
            var findCriteria = {_id: params.id};
            var self = this;
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }
            var query = WorkflowModel.findOne(findCriteria);
            query = query.select('_id worktiesInstancesIds');
            var workflowPromise = query.exec();

            MPromise.when(workflowPromise).addBack(function _onWorkflowFound(err, workflow) {
                if (err) {
                    return cb(errorSupervisorController.createGenericUnexpectedError({
                        err: err,
                        inputParameters: data
                    }));
                }

                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                findCriteria = {_id: params.worktyId, accountId: params.accountId};
                query = WorktyModel.findOne(findCriteria);
                query.exec().then(function _onWorktyFound(workty) {
                    if (!workty) {
                        return cb(errorSupervisorController.createNotOwnWorktyUsedError({inputParameters: data}));
                    }

                    var newWorktyInstance = new WorktyInstanceModel();
                    newWorktyInstance.workflowId = workflow._id;
                    newWorktyInstance.name = params.name || '';
                    newWorktyInstance.desc = params.desc || '';
                    newWorktyInstance.worktyId = params.worktyId;
                    newWorktyInstance.stateId = WorktyInstanceStateModel.findByName('initial')._id;

                    var positionIndex = workflow.worktiesInstancesIds.length === 0 ? 0 : workflow.worktiesInstancesIds.length - 1;

                    if (params.position_type) {
                        var positionType = params.position_type.toLowerCase();
                        switch (positionType) {
                            case 'first':
                            {
                                positionIndex = 0;
                                break;
                            }
                            case 'last':
                            {
                                positionIndex = workflow.worktiesInstancesIds.length;
                                break;
                            }
                            default:
                            {
                                return cb(errorSupervisorController.createPositionTypeInvalid({inputParameters: data}));
                            }
                        }
                    }

                    // TODO: Test invalid values of index/id
                    if (params.position_index) {
                        if (params.position_index < 0 || params.position_index > workflow.worktiesInstancesIds.length) {
                            return cb(errorSupervisorController.createPositionIdxInvalid({inputParameters: data}));
                        }

                        positionIndex = parseInt(params.position_index);
                    } else if (params.position_id) {
                        var indexOfWorktyInstance = _.map(workflow.worktiesInstancesIds, function (worktyInstanceId) {
                            return worktyInstanceId.toString();
                        }).indexOf(params.position_id);

                        if (indexOfWorktyInstance === -1) {
                            return cb(errorSupervisorController.createPositionIdInvalid({inputParameters: data}));
                        }

                        positionIndex = indexOfWorktyInstance;
                    }

                    newWorktyInstance.save(function _onWorktyInstanceSaved(err, savedWorktyInstance) {
                        if (err) {
                            return cb(errorSupervisorController.createGenericUnexpectedError({
                                err: err,
                                inputParameters: data
                            }));
                        }

                        if (!savedWorktyInstance) {
                            return cb(errorSupervisorController.createEntityNotSaved({inputParameters: data}));
                        }

                        var inputData = {
                            id: newWorktyInstance.worktyId.toString(),
                            worktyInstanceId: newWorktyInstance._id.toString(),
                            accountId: params.accountId
                        };
                        self.copyWorktyProperties(inputData, function _onWorktyPropertiesCopied(err, updatedWorktyInstance) {
                            if (err) {
                                return cb(errorSupervisorController.createGenericUnexpectedError({
                                    err: err,
                                    inputParameters: data
                                }));
                            }

                            if (!updatedWorktyInstance) {
                                return cb(errorSupervisorController.createEntityNotSaved({inputParameters: data}));
                            }

                            var query = {
                                '$push': {
                                    worktiesInstancesIds: {
                                        '$each': [updatedWorktyInstance],
                                        '$position': positionIndex
                                    }
                                }
                            };

                            workflow.update(query, function _onWorkflowUpdated(err, numAffected) {
                                if (numAffected === 0 || err) {
                                    updatedWorktyInstance.remove();
                                }

                                if (numAffected === 0) {
                                    return cb(errorSupervisorController.createEntityNotSaved({inputParameters: data}));
                                }

                                if (err) {
                                    return cb(errorSupervisorController.createGenericUnexpectedError({
                                        err: err,
                                        inputParameters: data
                                    }));
                                }

                                findCriteria = {_id: updatedWorktyInstance._id};
                                var query = WorktyInstanceModel.findOne(findCriteria);

                                // Embedding
                                if (params.embed) {
                                    var embedFields = params.embed.split(',');
                                    _.forEach(embedFields, function _onGetEmbedField(embedField) {
                                        var formattedEmbedField = embedField.trim().toLowerCase();
                                        if (formattedEmbedField === 'workflow') {
                                            query = query.populate('workflowId');
                                        } else if (formattedEmbedField === 'workty') {
                                            query = query.populate('worktyId');
                                        } else if (formattedEmbedField === 'state') {
                                            query = query.populate('stateId');
                                        } else if (formattedEmbedField === 'properties') {
                                            query = query.populate('propertiesIds');
                                        }
                                    });
                                }

                                // Always embed properties ids
                                query = query.populate('propertiesIds');

                                query.exec().then(function _onWorktyInstanceFound(worktyInstance) {
                                    if (!worktyInstance) {
                                        return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                                    }

                                    cb(null, worktyInstance);
                                }).end(function _onWorktyInstanceFoundError(err) {
                                    if (err) {
                                        cb(errorSupervisorController.createGenericUnexpectedError({
                                            err: err,
                                            inputParameters: data
                                        }));
                                    }
                                });
                            });
                        });
                    });
                });
            });
        },
        updateWorktyInstance: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var excludeState = true;
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                } else {
                    excludeState = false;
                }

                delete params.hasAdminRole;
            }

            var query = WorkflowModel.findOne(findCriteria);
            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                }

                var updateCriteria = {};
                var excludeKeys = ['id', '_id', 'accountId', 'sort', 'worktyId', 'worktyInstanceId', 'workflowId', 'propertiesIds', 'created', 'fields', 'count', 'pretty', 'page_num', 'per_page', 'typeId', 'socket'];
                if (excludeState === true) {
                    excludeKeys.push('stateId');
                }

                // Update
                _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                    updateCriteria[key] = params[key];
                });

                if (Object.keys(updateCriteria).length === 0) {
                    return cb(errorSupervisorController.createBadDigestError({inputParameters: data}));
                }

                findCriteria = {_id: params.worktyInstanceId};
                query = WorktyInstanceModel.findOneAndUpdate(findCriteria, updateCriteria, {'new': true});

                // Embedding
                if (params.embed) {
                    var embedFields = params.embed.split(',');
                    _.forEach(embedFields, function _onGetEmbedField(embedField) {
                        var formattedEmbedField = embedField.trim().toLowerCase();
                        if (formattedEmbedField === 'state') {
                            query = query.populate('stateId');
                        }
                    });
                }

                // Return the properties array
                query = query.populate('propertiesIds');
                return query.exec();
            }).then(function _onWorktyInstanceFoundAndUpdated(updatedWorktyInstance) {
                if (!updatedWorktyInstance) {
                    return cb(errorSupervisorController.createEntityNotUpdated({ inputParameters: data }));
                }

                cb(null, updatedWorktyInstance);
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        delWorktyInstance: function (data, cb) {
            // TODO: Check is workty is running
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = WorkflowModel.findOne(findCriteria);
            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                }

                findCriteria = {_id: params.worktyInstanceId};
                WorktyInstanceModel.findOne(findCriteria).exec(function _onWorktyInstanceFound(err, worktyInstance) {
                    if (err) {
                        return cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                    }

                    if (!worktyInstance) {
                        return cb(errorSupervisorController.createEntityNotDeleted({ inputParameters: data }));
                    }

                    var i = workflow.worktiesInstancesIds.indexOf(params.worktyInstanceId);
                    if (i !== -1) {
                        workflow.worktiesInstancesIds.splice(i, 1);
                    }

                    worktyInstance.remove();

                    workflow.save(function _onWorkflowSaved(err, updatedWorkflow) {
                        if (err) {
                            return cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                        }

                        if (!updatedWorkflow) {
                            return cb(errorSupervisorController.createEntityNotUpdated({ inputParameters: data }));
                        }

                        cb(null, updatedWorkflow);
                    });
                });
            }).end(function _onWorkflowFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        updateWorktyInstanceProperty: function(data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = WorkflowModel.findOne(findCriteria);
            query.exec().then(function _onWorkflowFound(workflow) {
                if (!workflow) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                findCriteria = {_id: params.propertyId};
                var updateCriteria = {};
                var excludeKeys = ['id', '_id', 'sort', 'accountId', 'workflowId', 'worktyInstanceId', 'propertyId', 'fields', 'count', 'pretty', 'page_num', 'per_page', 'socket'];

                // Update
                _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                    updateCriteria[key] = params[key];
                });

                if (Object.keys(updateCriteria).length === 0) {
                    return cb(errorSupervisorController.createBadDigestError({inputParameters: data}));
                }

                return WorktyPropertyModel.findOneAndUpdate(findCriteria, updateCriteria, {'new': true}).exec();
            })
            .then(function _onWorktyInstancePropertyFoundAndUpdated(updatedWorktyInstanceProperty) {
                if (!updatedWorktyInstanceProperty) {
                    return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                }

                cb(null, updatedWorktyInstanceProperty);
            }).end(function _onWorktyInstancePropertyUpdatedError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        // This method is not provided for external usage. It's invoked when new workty instance is added.
        copyWorktyProperties: function(data, cb) {
            var params = data;
            var findCriteria = {_id: params.id, accountId: params.accountId};

            var query = WorktyModel.findOne(findCriteria);
            query = query.populate('propertiesIds');

            query.exec().then(function _onWorktyFound(workty) {
                if (!workty) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                findCriteria = {_id: params.worktyInstanceId, worktyId: params.id};
                query = WorktyInstanceModel.findOne(findCriteria);
                query = query.populate('propertiesIds');

                query.exec().then(function _onWorktyInstanceFound(worktyInstance) {
                    if (!worktyInstance) {
                        return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                    }

                    var propertiesFunctions = [];

                    _.forEach(workty.propertiesIds, function _onEachProperty(property) {
                        var newWorktyInstanceProperty = new WorktyPropertyModel();
                        newWorktyInstanceProperty.name = property.name;
                        newWorktyInstanceProperty.value = property.value;
                        propertiesFunctions.push(Q.ninvoke(newWorktyInstanceProperty, 'save'));
                        worktyInstance.propertiesIds.push(newWorktyInstanceProperty);
                    });

                    Q.all(propertiesFunctions).then(function _onWorktyInstancyPropertiesSaved(properties) {
                        worktyInstance.save(function _onWorktyInstanceSaved(err, updatedWorktyInstance) {
                            if (err) {
                                return cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                            }

                            if (!updatedWorktyInstance) {
                                return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                            }

                            cb(null, updatedWorktyInstance);
                        });
                    });
                });
            }).end(function _onWorktyFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        getDictionary: function(data, cb) {
            switch (data) {
                case 'workflow-workty-instance-types':
                    return WorktyInstanceStateModel.getAll(cb);
                default:
                    return cb(new Error('The dictionary name ' + data + ' was not found'));
            }
        }
    };
};

module.exports = SupervisorWorkflowController;

