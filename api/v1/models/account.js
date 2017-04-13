'use strict';
/**
 * Created by Alex Levshin on 17/8/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
//var passportLocalMongoose = require('passport-local-mongoose');
var Hash = require('password-hash');

var AccountSchema = new Schema({
    oauthID: String,
    name: {type: String},
    email: {type: String, required: true, unique: true},
    password: {type: String,
        set: function(newValue) {
            return Hash.isHashed(newValue) ? newValue : Hash.generate(newValue, {algorithm: 'sha256'});
        }
    },
    aclRoleNames: {type: Array, required: true, default: []},
    created: {type: Date, required: true, default: new Date()},
    amount: {type: Number, required: true, min: 0, default: 0}, // The amount in USD, real amount = amount / 100
    removed: {type: Boolean, default: false},
    removedDate: {type: Date},
    __v: {type: String, select: false}
});

//AccountSchema.plugin(passportLocalMongoose);

AccountSchema.statics.authenticateByEmail = function(email, password, cb) {
    this.findOne({email: email}, function(err, account) {
        if (account && Hash.verify(password, account.password)) {
            cb(null, account);
        } else if (!account) {
            // Email or password was invalid (no MongoDB error)
            err = new Error('Your email address or password is invalid. Please try again.');
            cb(err);
        } else {
            // Something bad happened with MongoDB. You shouldn't run into this often.
            cb(err);
        }
    });
};

AccountSchema.statics.authenticateByProfile = function(name, oauthId, cb) {
    this.findOne({name: name, oauthID: oauthId}, function(err, account) {
        if (account && !err) {
            cb(null, account);
        } else if (!account) {
            // Email or oauth id was invalid (no MongoDB error)
            err = new Error('Your credentials are invalid. Please try again.');
            cb(err);
        } else {
            // Something bad happened with MongoDB. You shouldn't run into this often.
            cb(err);
        }
    });
};

var AccountModel = global.db.model('accounts', AccountSchema);

module.exports.schema = AccountSchema;
module.exports.defaultModel = AccountModel;
module.exports.collectionName = 'accounts';