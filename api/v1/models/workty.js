'use strict';
/**
 * Created by Alex Levshin on 14/9/16.
 */
var _ = require('lodash');
var mongoose = require('mongoose');
var WorktyInstanceModel = require('./workty-instance').defaultModel;
var WorktyPropertyModel = require('./workty-property').defaultModel;
var WorkflowModel = require('./workflow').defaultModel;
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

var WorktySchema = new Schema({
    name: {type: String, required: true},
    desc: String,
    accountId: {type: ObjectId, ref: 'accounts', required: true},
    typeId: {type: ObjectId, ref: 'workty_types', required: true},
    created: {type: Date, required: true, default: new Date()},
    categoryId: {type: ObjectId, ref: 'workty_categories', required: true},
    languageTypeId: {type: ObjectId, ref: 'workty_language_types', required: true},
    validationStateId: {type: ObjectId, ref: 'workty_validation_states', required: true},
    entryPointModuleFileName: {type: String, required: true},
    compressedCode: Buffer,
    template: {type: Boolean, required: true, default: false}, // True - admin, False - user
    propertiesIds: [{type: ObjectId, ref: 'workty_properties'}],
    // TODO: Refactor price plan settings into single entity
    price: {type: Number, required: true, min: 0, default: 0}, // The price in USD, 0 means free. real price = (price / 100) * (1 - discountPercent / 100))
    discountPercent: {type: Number, required: true, min: 0, max: 30, default: 0}, // The discount value in percents (0 means No discount)
    __v: {type: String, select: false}
});

WorktySchema.pre('remove', function(next) {
    // 'this' is the client being removed. Provide callbacks here if you want
    // to be notified dof the calls result
    var id = this._id;
    var propertiesIds = this.propertiesIds;
    var query = WorktyInstanceModel.find({worktyId: id});

    query.exec().then(function(worktyInstances) {
        // Remove all properties for workty instance
        if (worktyInstances !== null) {
            _.each(worktyInstances, function _onEachWorktyProperty(worktyInstance) {
                if (worktyInstance.propertiesIds.length > 0) {
                    WorktyPropertyModel.find({'_id': {$in: worktyInstance.propertiesIds}}).exec(function (err, worktyProperties) {
                        _.each(worktyProperties, function _onEachWorktyProperty(worktyProperty) {
                            worktyProperty.remove();
                        });
                    });
                }
                worktyInstance.remove();
            });
        }

        query = WorkflowModel.find({'worktiesInstancesIds': {$in : [id]}});
        return query.exec();
    }).then(function(workflows) {
        if (workflows !== null) {
            _.each(workflows, function (workflow) {
                workflow.worktiesInstancesIds = _.reject(workflow.worktiesInstancesIds, function (worktyInstanceId) {
                    return worktyInstanceId.equals(id);
                });
                workflow.save();
            });
        }

        query = WorktyPropertyModel.find({'_id': {$in : propertiesIds}});
        return query.exec();
    }).then(function(worktyProperties) {
        if (worktyProperties !== null) {
            // Remove all properties for workty
            _.each(worktyProperties, function _onEachWorktyProperty(worktyProperty) {
                worktyProperty.remove();
            });
        }

        next();
    });
});

var Workty = global.db.model('workties', WorktySchema);

module.exports.schema = WorktySchema;
module.exports.defaultModel = Workty;
module.exports.collectionName = 'workties';