/**
 * Created by Alex Levshin on 17/2/16.
 */
'use strict';
var PREFIX = 'sv.workty.';

(function(isNode, isAngular) {
    var protocol = {
        version: '1.0.0',
        description: 'Web-socket core protocol to data exchanging between supervisor ' +
                      'workties context and web client',
        OPERATIONS: {
            REFRESH_ALL: {name: PREFIX + 'refresh.all', permissionName: 'view'},
            REFRESH_CATEGORIES_ALL: {name: PREFIX + 'refresh.categories.all', permissionName: 'view'},
            REFRESH_TYPES_ALL: {name: PREFIX + 'refresh.types.all', permissionName: 'view'},
            REFRESH_LANGUAGE_TYPES_ALL: {name: PREFIX + 'refresh.language.types.all', permissionName: 'view'},
            REFRESH: {name: PREFIX + 'refresh', permissionName: 'view'},
            ADD: {name: PREFIX + 'add', permissionName: 'create'},
            UPD: {name: PREFIX + 'upd', permissionName: 'update'},
            DEL: {name: PREFIX + 'del', permissionName: 'delete'},
            REFRESH_ALL_PROPERTIES: {name: PREFIX + 'refresh.all.properties', permissionName: 'view'},
            ADD_PROPERTY: {name: PREFIX + 'add.property', permissionName: 'update'},
            UPD_PROPERTY: {name: PREFIX + 'upd.property', permissionName: 'update'},
            DEL_PROPERTY: {name: PREFIX + 'del.property', permissionName: 'update'},
            INITIALIZED: PREFIX + 'initialized',
            CHANGED: PREFIX + 'changed',
            AUTHENTICATE: 'authentication',
            AUTHENTICATED: 'authenticated'
        }
    };

    if (isAngular) {
        // AngularJS module definition
        angular.module('worktyApp.constants.workty', []).
            constant('worktyProtocol', protocol);
    } else if (isNode) {
        // NodeJS module definition
        module.exports = protocol;
    }
})(typeof module !== 'undefined' && module.exports, typeof angular !== 'undefined');