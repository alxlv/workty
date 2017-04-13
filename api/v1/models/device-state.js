'use strict';
/**
 * Created by Alex Levshin on 14/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// waiting
// running
// disconnected
var DeviceStateSchema = new Schema({
    name:{type: String, required: true},
    __v: {type: String, select: false}
});

DeviceStateSchema.statics.findByName = function (name) {
    return _deviceStates[name.toLowerCase()];
};

DeviceStateSchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onDeviceStatesReturned(err, deviceStates) {
        if (err) {
            cb(err);
        } else {
            if (!deviceStates) {
                cb(null, []);
            } else {
                // TODO: update private variable
                cb(null, deviceStates);
            }
        }
    });
};

var DeviceState = global.db.model('device_states', DeviceStateSchema);

// Cache objects
var _stream = DeviceState.find({}).stream();
var _deviceStates = {};
_stream.on('data', function(deviceState) {
    _deviceStates[deviceState.name] = deviceState;
}).on('error', function(err) {
    // Error handling
}).on('close', function(deviceState) {
    // All done, results object is ready
    //console.log(_deviceStates);
});

module.exports.schema = DeviceStateSchema;
module.exports.defaultModel = DeviceState;
module.exports.collectionName = 'device_states';
