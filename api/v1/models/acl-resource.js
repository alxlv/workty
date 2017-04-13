'use strict';
/**
 * Created by Alex Levshin on 4/6/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var AclResourceSchema = new Schema({
    name: {type: String, required: true},
    authTimeout: {type: Number},
    refreshingTimeout: {type: Number},
    maxReconnectionAttempts: {type: Number},
    static: {type: Boolean, default: false},
    __v: {type: String, select: false}
});

AclResourceSchema.statics.findByName = function (name) {
    return _aclResources[name.toLowerCase()];
};

AclResourceSchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onAclResourcesReturned(err, aclResources) {
        if (err) {
            cb(err);
        } else {
            if (!aclResources) {
                cb(null, []);
            } else {
                // TODO: update private variable
                cb(null, aclResources);
            }
        }
    });
};

var AclResource = global.db.model('acl_resources', AclResourceSchema);

// Cache objects
var _stream = AclResource.find({}).stream();
var _aclResources = {};
_stream.on('data', function(aclResource) {
    _aclResources[aclResource.name] = aclResource;
}).on('error', function(err) {
    // Error handling
}).on('close', function(aclResource) {
    // All done, results object is ready
    //console.log(_aclResources);
});

module.exports.schema = AclResourceSchema;
module.exports.defaultModel = AclResource;
module.exports.collectionName = 'acl_resources';