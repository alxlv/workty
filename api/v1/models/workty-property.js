'use strict';
/**
 * Created by Alex Levshin on 14/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Mixed = Schema.Types.Mixed;

var WorktyPropertySchema = new Schema({
    name: {type: String, required: true},
    value: {type: Mixed}, // anything goes, by default creates empty string
    __v: {type: String, select: false}
});

var WorktyProperty = global.db.model('workty_properties', WorktyPropertySchema);

module.exports.schema = WorktyPropertySchema;
module.exports.defaultModel = WorktyProperty;
module.exports.collectionName = 'workty_properties';