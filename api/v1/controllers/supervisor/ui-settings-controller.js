'use strict';
/**
 * Created by Alex Levshin on 21/9/16.
 */
var UiSettingsModel = require('../../models/ui-settings').defaultModel;
var mongoose = require('mongoose');
var errorSupervisorController = require('./error-controller')();
var MaxDocumentSizeBytes = 16 * 1024 * 1024; // 16 Mb
var _ = require('lodash');

var SupervisorUiSettingsController = function() {

    return {
        loadWorkflow: function (data, cb) {
            var params = data;
            var findCriteria = data;
            findCriteria.accountId = params.accountId;

            var query = UiSettingsModel.findOne(findCriteria);

            query.exec().then(function _onWorkflowUiSettingsFound(workflowUiSettings) {
                if (!workflowUiSettings) {
                    return cb(null, {});
                }

                cb(null, workflowUiSettings);
            }).end(function _onWorkflowUiSettingsFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        saveWorkflow: (data, cb) => {
            let params = data;

            if (!params.json || params.json.length > MaxDocumentSizeBytes) {
                return cb(errorSupervisorController.createMaxDocumentSizeReachedError({inputParameters: {size: params.json ? params.json.length : 0}}));
            }

            let uiSettings = new UiSettingsModel();
            uiSettings.accountId = params.accountId;
            uiSettings.workflowId = data.workflowId;
            uiSettings.json = params.json;

            // Create and assign new object to eliminate error with updating exisitng document (immutable _id field)
            let uiSettingsToUpdate = {};
            uiSettingsToUpdate = _.assign(uiSettingsToUpdate, uiSettings._doc);
            // Delete auto generated id field
            delete uiSettingsToUpdate._id;

            UiSettingsModel.findOneAndUpdate({accountId: params.accountId, workflowId: uiSettingsToUpdate.workflowId}, uiSettingsToUpdate, {upsert: true, 'new': true}, (err, savedWorkflowUiSettings) => {
                if (err) {
                    if (err.name === 'ValidationError') {
                        return cb(errorSupervisorController.createMissingParameterError({
                            validationError: err,
                            inputParameters: data
                        }));
                    }

                    return cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }

                if (!savedWorkflowUiSettings) {
                    return cb(errorSupervisorController.createEntityNotSaved({inputParameters: data}));
                }

                let inputData = {};
                inputData = _.assign(inputData, data);
                cb(null, inputData);
            });
        }
    };
};

module.exports = SupervisorUiSettingsController;

