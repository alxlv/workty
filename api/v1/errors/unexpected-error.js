'use strict';
/**
 * Created by Alex Levshin on 11/12/16.
 */
var restify = require('restify');
var util = require('util');
var _ = require('lodash');

var errors = [
    {code: 1, name: 'UNEXPECTED', message: 'Unexpected error, please check request parameters or contact with our support service'},
    {code: 2, name: 'ENT_NOT_FOUND', message: 'The entity was not found'},
    {code: 3, name: 'ENT_NOT_UPDATED', message: 'The entity was not updated'},
    {code: 4, name: 'ENT_NOT_DELETED', message: 'The entity was not deleted'},
    {code: 5, name: 'ENT_NOT_SAVED', message: 'The entity was not saved'},
    {code: 6, name: 'MAX_WORKFLOW_INSTANCES', message: 'Max workflow instances limit per account'},
    {code: 7, name: 'WORKFLOW_INSTANCE_WAITING', message: 'Workflow instance is waiting'},
    {code: 8, name: 'WORKFLOW_INSTANCE_RUNNING', message: 'Workflow instance is running'},
    {code: 9, name: 'WORKFLOW_INSTANCE_NOT_RUNNING', message: 'Workflow instance is completed'},
    {code: 10, name: 'POSITION_IDX_INVALID', message: 'Position index is invalid'},
    {code: 11, name: 'POSITION_ID_INVALID', message: 'Position id is invalid'},
    {code: 12, name: 'POSITION_TYPE_INVALID', message: 'Wrong position type value, allowed values are first, last, after, before'},
    {code: 13, name: 'OPERATION_FORBIDDEN', message: 'The operation is forbidden'},
    {code: 14, name: 'ACCOUNT_REMOVED', message: 'The account was removed. Please recover it'},
    {code: 15, name: 'NOT_ENOUGH_FUNDS', message: 'You do not have enough funds to process operation. Please fill in your account amount'},
    {code: 16, name: 'MAX_DOCUMENT_SIZE_REACHED', message: 'The size of document is too large'}
];

function _formatValidationErrors(err) {
    var errors = [];
    var excludeKeys = [];

    _.chain(_.keys(err.errors)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
        errors.push({
            message: err.errors[key].message
        });
    });

    return errors;
}

function _getErrorMessageByCode(code) {
    var error = _.find(errors, {code: code});
    if (error) {
        return error.message;
    }
    return errors[0].message;
}

function UnexpectedError(error) {
    restify.RestError.call(this, {
        restCode: 'UnexpectedError',
        statusCode: 500,
        body: error,
        constructorOpt: UnexpectedError
    });
    this.name = 'UnexpectedError';
}
util.inherits(UnexpectedError, restify.RestError);

module.exports = {
    constructor: UnexpectedError,
    getErrorMessageByCode: _getErrorMessageByCode,
    formatValidationErrors: _formatValidationErrors
};