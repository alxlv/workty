'use strict';
/**
 * Created by Alex Levshin on 14/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// initial
// waiting
// running
// completed
var WorktyInstanceStateSchema = new Schema({
    name: {type: String, required: true},
    __v: {type: String, select: false}
});

WorktyInstanceStateSchema.statics.findByName = function (name) {
    return _worktyInstanceStates[name.toLowerCase()];
};

WorktyInstanceStateSchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onWorktyInstanceStatesReturned(err, worktyInstanceStates) {
        if (err) {
            cb(err);
        } else {
            if (!worktyInstanceStates) {
                cb(null, []);
            } else {
                // TODO: update private variable
                cb(null, worktyInstanceStates);
            }
        }
    });
};

var WorktyInstanceState = global.db.model('workty_instance_states', WorktyInstanceStateSchema);

// Cache objects
var _stream = WorktyInstanceState.find({}).stream();
var _worktyInstanceStates = {};
_stream.on('data', function(worktyInstanceState) {
    _worktyInstanceStates[worktyInstanceState.name] = worktyInstanceState;
}).on('error', function(err) {
    // Error handling
}).on('close', function(worktyInstanceState) {
    // All done, results object is ready
    //console.log(_worktyInstanceStates);
});

module.exports.schema = WorktyInstanceStateSchema;
module.exports.defaultModel = WorktyInstanceState;
module.exports.collectionName = 'workty_instance_states';