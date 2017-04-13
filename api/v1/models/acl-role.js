'use strict';
/**
 * Created by Alex Levshin on 4/6/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// Predefined role names:
// - admin
// - regular
var AclRoleSchema = new Schema({
    name: {type: String, required: true},
    allows: {type: Array, required: true, default: []},
    __v: {type: String, select: false}
});

AclRoleSchema.statics.findByName = function (name) {
    return _aclRoles[name.toLowerCase()];
};

AclRoleSchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onAclRolesReturned(err, aclRoles) {
        if (err) {
            cb(err);
        } else {
            if (!aclRoles) {
                cb(null, []);
            } else {
                // TODO: update private variable
                cb(null, aclRoles);
            }
        }
    });
};

var AclRole = global.db.model('acl_roles', AclRoleSchema);

// Cache objects
var _stream = AclRole.find().stream();
var _aclRoles = {};
_stream.on('data', function(aclRole) {
    _aclRoles[aclRole.name] = aclRole;
}).on('error', function(err) {
    // Error handling
}).on('close', function(aclRole) {
    // All done, results object is ready
    //console.log(_aclRoles);
});

module.exports.schema = AclRoleSchema;
module.exports.defaultModel = AclRole;
module.exports.collectionName = 'acl_roles';