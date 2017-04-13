'use strict';
/**
 * Created by Alex Levshin on 14/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// in
// out
// inout
var WorktyTypeSchema = new Schema({
    name: {type: String, required: true},
    __v: {type: String, select: false}
});

WorktyTypeSchema.statics.findByName = function (name) {
    return _worktyTypes[name.toLowerCase()];
};

WorktyTypeSchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onWorktyTypesReturned(err, worktyTypes) {
        if (err) {
            cb(err);
        } else {
            if (!worktyTypes) {
                cb(null, []);
            } else {
                cb(null, worktyTypes);
            }
        }
    });
};

var WorktyType = global.db.model('workty_types', WorktyTypeSchema);

// Cache objects
var _stream = WorktyType.find({}).stream();
var _worktyTypes = {};
_stream.on('data', function(worktyType) {
    _worktyTypes[worktyType.name] = worktyType;
}).on('error', function(err) {
    // Error handling
}).on('close', function(worktyType) {
    // All done, results object is ready
    //console.log(_worktyTypes);
});

module.exports.schema = WorktyTypeSchema;
module.exports.defaultModel = WorktyType;
module.exports.collectionName = 'workty_types';