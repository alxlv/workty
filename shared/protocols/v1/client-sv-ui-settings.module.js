/**
 * Created by Alex Levshin on 17/2/16.
 */
'use strict';
var PREFIX = 'sv.uiSettings.';

(function(isNode, isAngular) {
    var protocol = {
        version: '1.0.0',
        description: 'Web-socket core protocol to data exchanging between supervisor ' +
        ' ui-settings context and web client',
        OPERATIONS: {
            LOAD_WORKFLOW: {name: PREFIX + 'load.workflow', permissionName: 'view'},
            SAVE_WORKFLOW: {name:  PREFIX + 'save.workflow', permissionName: 'update'},
            INITIALIZED:  PREFIX + 'initialized',
            CHANGED:  PREFIX + 'changed'
        }
    };

    if (isAngular) {
        // AngularJS module definition
        angular.module('worktyApp.constants.uiSettings', []).
            constant('uiSettingsProtocol', protocol);
    } else if (isNode) {
        // NodeJS module definition
        module.exports = protocol;
    }
})(typeof module !== 'undefined' && module.exports, typeof angular !== 'undefined');
