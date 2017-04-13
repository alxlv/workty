'use strict';
/**
 * Created by Alex Levshin on 17/8/16.
 */
var mongoose = require('mongoose');
var deepPopulate = require('mongoose-deep-populate')(mongoose);
var WorktyInstanceModel = require('./workty-instance').defaultModel;
var UiSettingsModel = require('./ui-settings').defaultModel;
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

//TODO: Read about indexes
var WorkflowSchema = new Schema({
    name: {type: String, required: true},
    desc: String,
    accountId: {type: ObjectId, ref: 'accounts', required: true},
    worktiesInstancesIds: [{type: ObjectId, ref: 'workty_instances'}],
    created: {type: Date, required: true, default: new Date()},
    __v: {type: String, select: false}
});

WorkflowSchema.pre('remove', function(next) {
    // 'this' is the client being removed. Provide callbacks here if you want
    // to be notified of the calls' result.
    WorktyInstanceModel.remove({workflowId: this._id}).exec();
    UiSettingsModel.remove({workflowId: this._id}).exec();
    next();
});

WorkflowSchema.plugin(deepPopulate);
//WorkflowSchema.set('versionKey', false);

var Workflow = global.db.model('workflows', WorkflowSchema);

module.exports.schema = WorkflowSchema;
module.exports.defaultModel = Workflow;
module.exports.collectionName = 'workflows';
