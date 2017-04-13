/**
 * Created by Alex Levshin on 17/2/16.
 */
'use strict';
var PREFIX = 'sv.workflow.';

(function(isNode, isAngular) {
    var protocol = {
        version: '1.0.0',
        description: 'Web-socket core protocol to data exchanging between supervisor' +
                     ' workflows context and web client',
        OPERATIONS: {
            REFRESH_ALL: {name: PREFIX + 'refresh.all', permissionName: 'view'},
            REFRESH: {name: PREFIX + 'refresh', permissionName: 'view'},
            ADD: {name: PREFIX + 'add', permissionName: 'create'},
            UPD: {name: PREFIX + 'upd', permissionName: 'update'},
            DEL: {name: PREFIX + 'del', permissionName: 'delete'},
            RUN: {name: PREFIX + 'run', permissionName: 'update'},
            PAUSE: {name: PREFIX + 'pause', permissionName: 'update'},
            STOP: {name: PREFIX + 'stop', permissionName: 'update'},
            ADD_WORKTY_INSTANCE: {name: PREFIX + 'add.workty.instance', permissionName: 'update'},
            UPD_WORKTY_INSTANCE: {name: PREFIX + 'upd.workty.instance', permissionName: 'update'},
            DEL_WORKTY_INSTANCE: {name: PREFIX + 'del.workty.instance', permissionName: 'update'},
            UPD_WORKTY_INSTANCE_PROPERTY: {name: PREFIX + 'upd.workty.instance.property',
                                           permissionName: 'update'},
            INITIALIZED: PREFIX + 'initialized',
            CHANGED: PREFIX + 'changed',
            AUTHENTICATE: 'authentication',
            AUTHENTICATED: 'authenticated'
        }
    };

    if (isAngular) {
        // AngularJS module definition
        angular.module('worktyApp.constants.workflow', []).
            constant('workflowProtocol', protocol);
    } else if (isNode) {
        // NodeJS module definition
        module.exports = protocol;
    }
})(typeof module !== 'undefined' && module.exports, typeof angular !== 'undefined');