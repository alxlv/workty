'use strict';
/**
 * Created by Alex Levshin on 3/9/16.
 */
var _ = require('lodash');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

// Structure example:
//   nodejs
//     0.10.25
//   java
//     8
//   python
//     3.14.1-6
var WorktyLanguageTypeSchema = new Schema({
    name: {type: String, required: true},
    parentId: {type: ObjectId, ref: 'workty_language_types'},
    __v: {type: String, select: false}
});

// TODO: At this moment it's a tro levels hierarchy. in case of creating new levels use workty category approach
WorktyLanguageTypeSchema.statics.findBy = function (data, cb) {
    if (data.version) {
        return _.find(_worktyLanguageTypes, function _onEachWorktyLanguageType(languageType) {
            var result;

            if (data.name) {
                if (languageType.name === data.name) {
                    result = _.find(languageType.versions, function _onEachLanguageTypeVersion(version) {
                                        if (version.name === data.version) {
                                            return languageType;
                                        }
                                    });
                }
            } else {
                result = _.find(languageType.versions, function _onEachLanguageTypeVersion(version) {
                    if (version.name === data.version) {
                        return languageType;
                    }
                });
            }

            if (result) {
                if (cb) {
                    return cb(null, result);
                } else {
                    return result;
                }
            }
        });
    }

    // Return first language type version
    if (_worktyLanguageTypes[data.name.toLowerCase()]) {
        if (_worktyLanguageTypes[data.name.toLowerCase()].versions.length > 0) {
            if (cb) {
                return cb(null, _worktyLanguageTypes[data.name.toLowerCase()].versions[0]);
            }
            return _worktyLanguageTypes[data.name.toLowerCase()].versions[0];
        }
    }

    if (cb) {
        return cb(new Error('The language type was not found'));
    }

    return null;
};

WorktyLanguageTypeSchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onWorktyLanguageTypesReturned(err, worktyLanguageTypes) {
        if (err) {
            cb(err);
        } else {
            if (!worktyLanguageTypes) {
                cb(null, []);
            } else {
                // TODO: update private variable
                cb(null, worktyLanguageTypes);
            }
        }
    });
};

var WorktyLanguageType = global.db.model('workty_language_types', WorktyLanguageTypeSchema);

// Cache objects
var _stream = WorktyLanguageType.find({}).stream();
var _worktyLanguageTypes = {};

_stream.on('data', function(worktyLanguageType) {
    if (worktyLanguageType.parentId === null) {
        var value = { _id: worktyLanguageType._id, parentId: worktyLanguageType.parentId, name: worktyLanguageType.name };
        value.versions = [];
        _worktyLanguageTypes[worktyLanguageType.name] = value;
    } else {
        var parent = _.find(_worktyLanguageTypes, { _id: worktyLanguageType.parentId });
        if (parent) {
            parent.versions.push(worktyLanguageType);
        }
    }
}).on('error', function(err) {
    // Error handling
}).on('close', function(worktyLanguageType) {
    // All done, results object is ready
    //console.log(_worktyLanguageTypes);
});

module.exports.schema = WorktyLanguageTypeSchema;
module.exports.defaultModel = WorktyLanguageType;
module.exports.collectionName = 'workty_language_types';