/**
 * Created by Alex Levshin on 14/9/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

var PaymentTransactionSchema = new Schema({
    accountId: {type: ObjectId, ref: 'accounts', required: true},
    worktyId: {type: ObjectId, ref: 'workties'}, // Not required, because can be another entities in feature
    msg: String,
    created: {type: Date, required: true, default: new Date()},
    __v: {type: String, select: false}
});

var PaymentTransactionModel = global.db.model('payment_transactions', PaymentTransactionSchema);

module.exports.schema = PaymentTransactionSchema;
module.exports.defaultModel = PaymentTransactionModel;
module.exports.collectionName = 'payment_transactions';