/**
 * Created by Alex Levshin on 17/2/16.
 */
'use strict';
var PREFIX = 'sv.worker.';

var protocol = {
    version: '1.0.0',
    description: 'Web-socket core protocol to data exchanging between ' +
                 'supervisor and device workers',
    OPERATIONS: {
        OBSERVE: PREFIX + 'observe',
        GET_CONFIGURATION: PREFIX + 'get.configuration',
        SEND_CONFIGURATION: PREFIX + 'send.configuration',
        EXECUTE: PREFIX + 'execute',
        COMPLETED: PREFIX + 'completed',
        ERROR: PREFIX + 'error',
        DISCONNECT: PREFIX + 'disconnect'
    }
};

module.exports = protocol;