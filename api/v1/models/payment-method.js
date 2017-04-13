/**
 * Created by Alex Levshin on 14/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

var PaymentMethodSchema = new Schema({
    accountId: {type: ObjectId, ref: 'accounts', required: true},
    name: {type: String, required: true},
    desc: String
});

var PaymentMethodModel = global.db.model('payment_methods', PaymentMethodSchema);

module.exports.schema = PaymentMethodSchema;
module.exports.defaultModel = PaymentMethodModel;
module.exports.collectionName = 'payments_methods';