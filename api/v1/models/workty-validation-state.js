'use strict';
/**
 * Created by Alex Levshin on 3/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// in progress
// approved
// rejected
var WorktyValidationStateSchema = new Schema({
    name: {type: String, required: true},
    __v: {type: String, select: false}
});

WorktyValidationStateSchema.statics.findByName = function (name) {
    return _worktyValidationStates[name.toLowerCase()];
};

WorktyValidationStateSchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onWorktyTypesReturned(err, worktyValidationStates) {
        if (err) {
            cb(err);
        } else {
            if (!worktyValidationStates) {
                cb(null, []);
            } else {
                // TODO: update private variable
                cb(null, worktyValidationStates);
            }
        }
    });
};

var WorktyValidationState = global.db.model('workty_validation_states', WorktyValidationStateSchema);

// Cache objects
var _stream = WorktyValidationState.find({}).stream();
var _worktyValidationStates = {};
_stream.on('data', function(worktyValidationState) {
    _worktyValidationStates[worktyValidationState.name] = worktyValidationState;
}).on('error', function(err) {
    // Error handling
}).on('close', function(worktyValidationState) {
    // All done, results object is ready
    //console.log(_worktyValidationStates);
});

module.exports.schema = WorktyValidationStateSchema;
module.exports.defaultModel = WorktyValidationState;
module.exports.collectionName = 'workty_validation_states';