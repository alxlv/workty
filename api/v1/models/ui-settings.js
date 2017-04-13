'use strict';
/**
 * Created by Alex Levshin on 21/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

var UiSettingsSchema = new Schema({
    accountId: {type: ObjectId, ref: 'accounts', required: true},
    workflowId: {type: ObjectId, ref: 'workflows'}, // not required
    json: {type: String},
    __v: {type: String, select: false}
});

var UiSettingsModel = global.db.model('ui_settings', UiSettingsSchema);

module.exports.schema = UiSettingsSchema;
module.exports.defaultModel = UiSettingsModel;
module.exports.collectionName = 'ui_settings';
