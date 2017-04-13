/**
 * Created by Alex Levshin on 17/2/16.
 */
'use strict';
var PREFIX = 'sv.account.';

(function(isNode, isAngular) {
    var protocol = {
        version: '1.0.0',
        description: 'Web-socket core protocol to data exchanging between supervisor ' +
        ' accounts context and web client',
        OPERATIONS: {
            REFRESH_ALL: {name: PREFIX + 'refresh.all', permissionName: 'view'},
            REFRESH: {name:  PREFIX + 'refresh', permissionName: 'view'},
            ADD: {name:  PREFIX + 'add', permissionName: 'create'},
            UPD: {name:  PREFIX + 'upd', permissionName: 'update'},
            DEL: {name:  PREFIX + 'del', permissionName: 'delete'},
            INITIALIZED:  PREFIX + 'initialized',
            CHANGED:  PREFIX + 'changed'
        }
    };

    if (isAngular) {
        // AngularJS module definition
        angular.module('worktyApp.constants.account', []).
            constant('accountProtocol', protocol);
    } else if (isNode) {
        // NodeJS module definition
        module.exports = protocol;
    }
})(typeof module !== 'undefined' && module.exports, typeof angular !== 'undefined');
