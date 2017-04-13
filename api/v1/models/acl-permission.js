'use strict';
/**
 * Created by Alex Levshin on 4/6/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// create
// view
// update
// delete
var AclPermissionSchema = new Schema({
    name: {type: String, required: true},
    __v: {type: String, select: false}
});

AclPermissionSchema.statics.findByName = function (name) {
    return _aclPermissions[name.toLowerCase()];
};

AclPermissionSchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onAclPermissionsReturned(err, aclPermissions) {
        if (err) {
            cb(err);
        } else {
            if (!aclPermissions) {
                cb(null, []);
            } else {
                // TODO: update private variable
                cb(null, aclPermissions);
            }
        }
    });
};

var AclPermission = global.db.model('acl_permissions', AclPermissionSchema);

// Cache objects
var _stream = AclPermission.find().stream();
var _aclPermissions = {};
_stream.on('data', function(aclPermission) {
    _aclPermissions[aclPermission.name] = aclPermission;
}).on('error', function(err) {
    // Error handling
}).on('close', function(aclPermission) {
    // All done, results object is ready
    //console.log(_aclPermissions);
});

module.exports.schema = AclPermissionSchema;
module.exports.defaultModel = AclPermission;
module.exports.collectionName = 'acl_permissions';