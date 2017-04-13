'use strict';
/**
 * Created by Alex Levshin on 12/11/16.
 */
var config = rootRequire('config');
var winston = require('winston');
var winstonGraylog2 = require('winston-graylog2');

module.exports = function Logger() {
    var options = {
        name: 'Graylog',
        level: 'debug',
        silent: false,
        handleExceptions: false,
        prelog: function(msg) {
            return msg.trim();
        },
        graylog: {
            servers: [{host: config.graylog.host, port: config.graylog.port}],
            facility: global.loggerFacility || 'Workty',
            bufferSize: 1400
        }
    };

    var logger = new (winston.Logger)({
        transports: [
            new (winstonGraylog2)(options)
        ]}
    );

    logger.exitOnError = false;

    return logger;
};