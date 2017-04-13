'use strict';
/**
 * Created by Alex Levshin on 11/18/16.
 */
var config = rootRequire('config');
var logger = require('./logger')();

var LoggerController = function() {
    return {
        debug: function(data) {
            logger.debug(data);
        },
        log: function(data) {
            logger.info(data);
        },
        error: function(data) {
            logger.error(data);
        },
        crit: function(data) {
            logger.crit(data);
        }
    };
};

module.exports = LoggerController;
