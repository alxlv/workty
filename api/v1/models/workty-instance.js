'use strict';
/**
 * Created by Alex Levshin on 14/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

var WorktyInstanceSchema = new Schema({
    workflowId: {type: ObjectId, ref: 'workflows'},
    worktyId: {type: ObjectId, ref: 'workties'},
    name: String,
    desc: String,
    stateId: {type: ObjectId, ref: 'workty_instance_states'},
    propertiesIds: [{type: ObjectId, ref: 'workty_properties'}],
    created: {type: Date, required: true, default: new Date()},
    __v: {type: String, select: false}
});

var WorktyInstance = global.db.model('workty_instances', WorktyInstanceSchema);

module.exports.schema = WorktyInstanceSchema;
module.exports.defaultModel = WorktyInstance;
module.exports.collectionName = 'workty_instances';