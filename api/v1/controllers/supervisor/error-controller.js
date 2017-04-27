'use strict';
/**
 * Created by Alex Levshin on 21/11/16.
 */
var parseArgs = require('minimist');
var argv = parseArgs(process.argv.slice(2));
var restify = require('restify');
var config = rootRequire('config');
var util = require('util');
var loggerController = rootRequire('shared/controllers/logger-controller')();
var UnexpectedError = require('../../errors/unexpected-error');
var majorVersion = argv.major_version || config.restapi.getLatestVersion().major;

var SupervisorErrorController = function() {

    function _create(options) {
        if (options.err) {
            var msg = 'error controller:' + util.inspect(options.err, {depth: null});
            //console.error(msg);
            loggerController.error(msg);
        }

        var statusCode = options.statusCode || 500;
        var code = options.code || '';

        var error = {
            body: {
                error: {
                    code: code,
                    error_link: config.restapi.errorLinkUrl + '/v' + majorVersion + '/' + (code !== '' ? code : statusCode)
                }
            }
        };

        // Pass input parameters
        if (options.inputParameters) {
            // Delete accountId, user should not see it
            if (options.inputParameters.accountId) {
                delete options.inputParameters.accountId;
            }
            error.body.error.inputParameters = options.inputParameters;
        }

        switch (statusCode) {
            case 400:
            {
                if (options.action === 1) {
                    return new restify.BadDigestError(error);
                }

                if (options.action === 2) {
                    return new restify.InvalidContentError(error);
                }
            }
            case 401:
            {
                return new restify.InvalidCredentialsError(error);
            }
            case 403:
            {
                return new restify.NotAuthorizedError(error);
            }
            case 409:
            {
                error.body.error.message = 'Validation Error';
                error.body.error.errors = UnexpectedError.formatValidationErrors(options.validationError);
                return new restify.MissingParameterError(error);
            }
            case 500:
            {
                error.body.error.message = UnexpectedError.getErrorMessageByCode(error.body.error.code);
                return new UnexpectedError.constructor(error.body);
            }
        }
    }

    return {
        formatLocationHeader: function (path) {
            return config.restapi.getConnectionString() + '/' + path;
        },
        createBadDigestError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 400;
            errorOptions.action = 1;

            return _create(errorOptions);
        },
        createInvalidContentError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 400;
            errorOptions.action = 2;

            return _create(errorOptions);
        },
        createInvalidCredentialsError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 401;

            return _create(errorOptions);
        },
        createMissingParameterError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 409;

            return _create(errorOptions);
        },
        createGenericUnexpectedError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 500;
            errorOptions.code = 1;

            return _create(errorOptions);
        },
        createEntityNotFound: function(data) {
            var options = data || {};
            options.statusCode = 500;
            options.code = 2;

            return _create(options);
        },
        createEntityNotUpdated: function(data) {
            var options = data || {};
            options.statusCode = 500;
            options.code = 3;

            return _create(options);
        },
        createEntityNotDeleted: function(data) {
            var options = data || {};
            options.statusCode = 500;
            options.code = 4;

            return _create(options);
        },
        createEntityNotSaved: function(data) {
            var options = data || {};
            options.statusCode = 500;
            options.code = 5;

            return _create(options);
        },
        createPositionIdxInvalid: function(data) {
            var options = data || {};
            options.statusCode = 500;
            options.code = 10;

            return _create(options);
        },
        createPositionIdInvalid: function(data) {
            var options = data || {};
            options.statusCode = 500;
            options.code = 11;

            return _create(options);
        },
        createPositionTypeInvalid: function(data) {
            var options = data || {};
            options.statusCode = 500;
            options.code = 12;

            return _create(options);
        },
        createOperationForbiddenError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 500;
            errorOptions.code = 13;

            return _create(errorOptions);
        },
        createAccountRemovedError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 500;
            errorOptions.code = 14;

            return _create(errorOptions);
        },
        createNotEnoughFundsError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 500;
            errorOptions.code = 15;

            return _create(errorOptions);
        },
        createMaxDocumentSizeReachedError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 500;
            errorOptions.code = 16;

            return _create(errorOptions);
        },
        createNotOwnWorktyUsedError: function(data) {
            var errorOptions = data || {};
            errorOptions.statusCode = 500;
            errorOptions.code = 17;

            return _create(errorOptions);
        }
    };
};

module.exports = SupervisorErrorController;