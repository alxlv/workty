'use strict';
/**
 * Created by Alex Levshin on 24/6/16.
 */
var _ = require('lodash');
var WorktyModel = require('../../models/workty').defaultModel;
var WorktyTypeModel = require('../../models/workty-type').defaultModel;
var WorktyPropertyModel = require('../../models/workty-property').defaultModel;
var WorktyCategoryModel = require('../../models/workty-category').defaultModel;
var WorktyLanguageTypeModel = require('../../models/workty-language-type').defaultModel;
var WorktyInstanceStateModel = require('../../models/workty-instance-state').defaultModel;
var WorktyValidationStateModel = require('../../models/workty-validation-state').defaultModel;
var mongoose = require('mongoose');
var util = require('util');
require('mongoose-when');
var MPromise = mongoose.Promise;
var errorSupervisorController = require('./error-controller')();
var Q = require('q');
var PerPageItems = 10;
var MinPageItems = 0;
var MaxPageItems = 250;

var DefaultPrice = 0; // Free
var DefaultDiscountPercent = 0; // Free

var SupervisorWorktyController = function() {

    return {
        getAll: function (data, cb) {
            var params = data;
            var findCriteria = {};
            var orTemplate = false;
            var excludeKeys = ['sort', 'fields', 'count', 'pretty', 'page_num', 'per_page', 'embed'];
            if (_.has(params, 'hasAdminRole')) {
                excludeKeys.push('accountId');
                if (params.hasAdminRole === false) {
                    orTemplate = true;
                }

                delete params.hasAdminRole;
            }
            var query = WorktyModel.find(findCriteria);

            // Admin user is able to get any workty, Regular user is able to see own workties and templates
            if (orTemplate === true) {
                query = query.or([{template: true},{accountId: params.accountId}]);
            }

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
                var embedFields = params.embed.split(',');
                _.forEach(embedFields, function _onGetEmbedField(embedField) {
                    if (embedField.toLowerCase().trim() === 'account') {
                        query = query.populate('accountId');
                    } else if (embedField.trim().toLowerCase() === 'properties') {
                        query = query.populate('propertiesIds');
                    } else if (embedField.trim().toLowerCase() === 'type') {
                        query = query.populate('typeId');
                    } else if (embedField.trim().toLowerCase() === 'category') {
                        query = query.populate('categoryId');
                    } else if (embedField.trim().toLowerCase() === 'languagetype') {
                        query = query.populate('languageTypeId');
                    } else if (embedField.trim().toLowerCase() === 'validationstate') {
                        query = query.populate('validationStateId');
                    }
                });
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

            query.exec().then(function _onWorktiesFound(workties) {
                cb(null, workties);
            }).end(function _onWorktiesFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        getById: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var orTemplate = false;
            var excludeKeys = ['fields', 'pretty', 'embed', 'id', 'count'];
            if (_.has(params, 'hasAdminRole')) {
                excludeKeys.push('accountId');
                if (params.hasAdminRole === false) {
                    orTemplate = true;
                }

                delete params.hasAdminRole;
            }
            var query = WorktyModel.findOne(findCriteria);

            // Admin user is able to get any workty, Regular user is able to see own workties and templates
            if (orTemplate === true) {
                query = query.or([{template: true},{accountId: params.accountId}]);
            }

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
                    if (formattedEmbedField === 'account') {
                        query = query.populate('accountId');
                    } else if (formattedEmbedField === 'properties') {
                        query = query.populate('propertiesIds');
                    } else if (formattedEmbedField === 'type') {
                        query = query.populate('typeId');
                    } else if (formattedEmbedField === 'category') {
                        query = query.populate('categoryId');
                    } else if (formattedEmbedField === 'languagetype') {
                        query = query.populate('languageTypeId');
                    } else if (formattedEmbedField === 'validationstate') {
                        query = query.populate('validationStateId');
                    }
                });
            }

            query.exec().then(function _onWorktyFound(workty) {
                if (!workty) {
                    return cb(null, {});
                }

                cb(null, workty);
            }).end(function _onWorktyFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        add: function (data, cb) {
            var params = data;

            var newWorkty = new WorktyModel();
            newWorkty.name = params.name;
            newWorkty.desc = params.desc || '';
            newWorkty.accountId = params.accountId;
            newWorkty.typeId = params.typeId || WorktyTypeModel.findByName('inout');
            newWorkty.categoryId = params.categoryId || WorktyCategoryModel.findByName('unsorted');
            newWorkty.languageTypeId = params.languageTypeId || WorktyLanguageTypeModel.findBy({name: 'nodejs'});
            newWorkty.validationStateId = WorktyValidationStateModel.findByName('in progress');
            newWorkty.entryPointModuleFileName = params.entryPointModuleFileName || 'app.js';
            newWorkty.template = params.template || false;
            newWorkty.price = params.price ? parseFloat(params.price).toFixed(2) * 100 : DefaultPrice;
            newWorkty.compressedCode = params.compressedCode ? new Buffer(params.compressedCode) : null;
            newWorkty.discountPercent = params.discountPercent ? parseFloat(params.discountPercent) * 100 : DefaultDiscountPercent;

            newWorkty.save(function _onWorktySaved(err, savedWorkty) {
                if (err) {
                    if (err.name === 'ValidationError') {
                        return cb(errorSupervisorController.createMissingParameterError({ validationError: err, inputParameters: data }));
                    }

                    return cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }

                if (!savedWorkty) {
                    return cb(errorSupervisorController.createEntityNotSaved({ inputParameters: data }));
                }

                cb(null, savedWorkty);
            });
        },
        update: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var updateCriteria = {};
            var excludeKeys = ['id', '_id', 'sort', 'accountId', 'validationStateId', 'created', 'fields', 'count', 'pretty', 'page_num', 'per_page', 'propertiesIds'];
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            // Update
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                // Need to validate required fields manually because of findOneAndUpdate skip it
                if (key === 'name' && !params[key]) {
                    var err = {
                        errors: {
                            name: {
                                message: 'Path `name` is required.'
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

            findCriteria = {_id: params.id};
            var query = WorktyModel.findOneAndUpdate(findCriteria, {'$set': updateCriteria}, {'new': true});
            query.exec().then(function _onWorktyFoundAndUpdated(updatedWorkty) {
                if (!updatedWorkty) {
                    return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                }

                cb(null, updatedWorkty);
            }).end(function _onWorktyFoundAndUpdatedError(err) {
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

            var query = WorktyModel.findOne(findCriteria);
            query.exec().then(function _onWorktyFound(workty) {
                if (!workty) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                workty.remove();

                cb(null, workty);
            }).end(function _onWorktyFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        getAllProperties: function(data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }
            var query = WorktyModel.findOne(findCriteria);
            query = query.populate('propertiesIds');

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

            query.exec().then(function _onWorktyFound(workty) {
                cb(null, workty.propertiesIds);
            }).end(function _onWorktyPropertiesFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        getPropertyById: function(data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            var excludeKeys = ['fields', 'pretty', 'id', 'count'];
            var query = WorktyPropertyModel.findOne(findCriteria);

            // Filter
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                query = query.where(key).equals(params[key]);
            });

            // Include/exclude fields in output
            if (params.fields) {
                var fields = params.fields.split(',').join(' ');
                query = query.select(fields);
            }

            query.exec().then(function _onWorktyPropertyFound(worktyProperty) {
                cb(null, worktyProperty);
            }).end(function _onWorktyPropertyFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        addProperty: function(data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = WorktyModel.findOne(findCriteria);
            query = query.select('_id propertiesIds');
            var worktyPromise = query.exec();

            MPromise.when(worktyPromise).addBack(function _onWorktyFound(err, workty) {
                if (err) {
                    return cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }

                if (!workty) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                var newWorktyProperty = new WorktyPropertyModel();
                newWorktyProperty.name = params.property.name;
                newWorktyProperty.value = params.property.value || '';

                var positionIndex = workty.propertiesIds.length === 0 ? 0 : workty.propertiesIds.length;

                newWorktyProperty.save(function _onWorktyPropertySaved(err, addedWorktyProperty) {
                    if (err) {
                        if (err.name === 'ValidationError') {
                            return cb(errorSupervisorController.createMissingParameterError({validationError: err, inputParameters: data}));
                        }
                        return cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                    }

                    if (!addedWorktyProperty) {
                        return cb(errorSupervisorController.createEntityNotSaved({inputParameters: data}));
                    }

                    var query = { '$push': { propertiesIds: {
                            '$each': [addedWorktyProperty],
                            '$position': positionIndex
                        }
                    }};

                    workty.update(query, function _onWorktyUpdated(err, numAffected) {
                        if (numAffected === 0 || err) {
                            addedWorktyProperty.remove();
                        }

                        if (numAffected === 0) {
                            return cb(errorSupervisorController.createBadDigestError({inputParameters: data}));
                        }

                        if (err) {
                            return cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                        }

                        findCriteria = { _id: addedWorktyProperty._id };
                        var query = WorktyPropertyModel.findOne(findCriteria);

                        query.exec().then(function _onWorktyPropertyFound(worktyProperty) {
                            if (!worktyProperty) {
                                return cb(errorSupervisorController.createEntityNotFound({ inputParameters: data }));
                            }

                            cb(null, worktyProperty);
                        }).end(function _onWorktyPropertyFoundError(err) {
                            if (err) {
                                cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                            }
                        });
                    });
                });
            });
        },
        updateProperty: function(data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = WorktyModel.findOne(findCriteria);
            query.exec().then(function _onWorktyFound(workty) {
                if (!workty) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                var updateCriteria = {};
                var excludeKeys = ['id', '_id'];

                // Update
                _.chain(_.keys(params.property)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                    // Need to validate required fields manually because of findOneAndUpdate skip it
                    if (key === 'name' && !params.property[key]) {
                        var err = {
                            errors: {
                                name: {
                                    message: 'Path `name` is required.'
                                }
                            }
                        };

                        return cb(errorSupervisorController.createMissingParameterError({validationError: err, inputParameters: data}));
                    }
                    updateCriteria[key] = params.property[key];
                });

                if (Object.keys(updateCriteria).length === 0) {
                    return cb(errorSupervisorController.createBadDigestError({inputParameters: data}));
                }

                findCriteria = {_id: params.property.id};

                return WorktyPropertyModel.findOneAndUpdate(findCriteria, updateCriteria, {'new': true}).exec();
            }).then(function _onWorktyPropertyFoundAndUpdated(updatedWorktyProperty) {
                if (!updatedWorktyProperty) {
                    return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                }

                cb(null, updatedWorktyProperty);
            }).end(function _onWorktyFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        delProperty: function(data, cb) {
            // TODO: Check is workty is running
            var params = data;
            var findCriteria = {_id: params.id};
            if (_.has(params, 'hasAdminRole')) {
                if (params.hasAdminRole === false) {
                    findCriteria.accountId = params.accountId;
                }

                delete params.hasAdminRole;
            }

            var query = WorktyModel.findOne(findCriteria);
            query.exec().then(function _onWorktyFound(workty) {
                if (!workty) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                findCriteria = {_id: params.property.id};
                WorktyPropertyModel.findOne(findCriteria).exec(function _onWorktyPropertyFound(err, worktyProperty) {
                    if (err) {
                        return cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                    }

                    if (!worktyProperty) {
                        return cb(errorSupervisorController.createEntityNotDeleted({ inputParameters: data }));
                    }

                    var i = workty.propertiesIds.indexOf(params.property.id);
                    if (i !== -1) {
                        workty.propertiesIds.splice(i, 1);
                    }

                    worktyProperty.remove();

                    workty.save(function _onWorktySaved(err, updatedWorkty) {
                        if (err) {
                            return cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                        }

                        if (!updatedWorkty) {
                            return cb(errorSupervisorController.createEntityNotUpdated({ inputParameters: data }));
                        }

                        cb(null, worktyProperty);
                    });
                });
            }).end(function _onWorktyFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        // This method is not provided for external usage. It's invoked when new workty is cloned (new transaction).
        copy: function(data, cb) {
            var newWorkty = new WorktyModel();
            var sourceWorkty = data.workty;

            // TODO: Use _.assign with customizer
            newWorkty.name = sourceWorkty.name;
            newWorkty.desc = sourceWorkty.desc || '';
            newWorkty.accountId = data.accountId;
            newWorkty.typeId = sourceWorkty.typeId;
            newWorkty.categoryId = sourceWorkty.categoryId;
            newWorkty.languageTypeId = sourceWorkty.languageTypeId;
            newWorkty.validationStateId = sourceWorkty.validationStateId;
            newWorkty.template = sourceWorkty.template;
            newWorkty.entryPointModuleFileName = sourceWorkty.entryPointModuleFileName;
            newWorkty.price = sourceWorkty.price;
            newWorkty.compressedCode = sourceWorkty.compressedCode;
            newWorkty.discountPercent = sourceWorkty.discountPercent;
            newWorkty.template = false; // Template is false

            var inputData = { workty: data.workty, newWorkty: newWorkty };
            this.copyProperties(inputData, function _onWorktyPropertiesCopied(err, updatedWorkty) {
                if (err) {
                    return cb(err);
                }

                cb(null, updatedWorkty);
            });
        },
        // This method is not provided for external usage. It's invoked when new workty instance is added.
        copyProperties: function(data, cb) {
            var propertiesFunctions = [];
            var newWorkty = data.newWorkty;
            var sourceWorkty = data.workty;
            var self = this;

            _.forEach(sourceWorkty.propertiesIds, function _onEachProperty(property) {
                var newWorktyInstanceProperty = new WorktyPropertyModel();
                newWorktyInstanceProperty.name = property.name;
                newWorktyInstanceProperty.value = property.value;
                propertiesFunctions.push(Q.ninvoke(newWorktyInstanceProperty, 'save'));
                newWorkty.propertiesIds.push(newWorktyInstanceProperty);
            });

            Q.all(propertiesFunctions).then(function _onWorktyPropertiesSaved(properties) {
                newWorkty.save(function _onWorktySaved(err, updatedWorkty) {
                    if (err) {
                        return cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                    }

                    if (!updatedWorkty) {
                        return cb(errorSupervisorController.createEntityNotUpdated({ inputParameters: data }));
                    }

                    // Get the saved workty with all properties
                    var inputData = { id: updatedWorkty._id, accountId: updatedWorkty.accountId, embed: 'properties' };
                    self.getById(inputData, function _onWorktyReturned(err, workty) {
                        if (err) {
                            return cb(err);
                        }

                        cb(null, workty);
                    });
                });
            });
        },
        getLanguageTypeName: function(data, cb) {
            return WorktyLanguageTypeModel.findBy(data, cb);
        },
        getCategoryPath: function(data, cb) {
            return WorktyCategoryModel.getPath(data, cb);
        },
        getDictionary: function(data, cb) {
            switch (data) {
                case 'workty-validation-states':
                    return WorktyValidationStateModel.getAll(cb);
                case 'workty-types':
                    return WorktyTypeModel.getAll(cb);
                case 'workty-categories':
                    return WorktyCategoryModel.getAll(cb);
                case 'workty-language-types':
                    return WorktyLanguageTypeModel.getAll(cb);
                case 'workty-instance-states':
                    return WorktyInstanceStateModel.getAll(cb);
                default:
                    return cb(new Error('The dictionary name ' + data + ' was not found'));
            }
        }
    };
};

module.exports = SupervisorWorktyController;

