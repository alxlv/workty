'use strict';
/**
 * Created by Alex Levshin on 17/8/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

var DeviceSchema = new Schema({
    name: {type: String, required: true},
    desc: String,
    protocol: {type: String, required: true},
    ip4Address: {type: String, required: true},
    ip6Address: String,
    port: {type: Number, required: true},
    created: {type: Date, required: true, default: new Date()},
    stateId: {type: ObjectId, ref: 'device_states'},
    disabled: {type: Boolean, default: false},
    __v: {type: String, select: false}
});

var DeviceModel = global.db.model('devices', DeviceSchema);

module.exports.schema = DeviceSchema;
module.exports.defaultModel = DeviceModel;
module.exports.collectionName = 'devices';