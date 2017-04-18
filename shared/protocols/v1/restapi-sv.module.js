/**
 * Created by Alex Levshin on 2/17/16.
 */
'use strict';
var PREFIX = 'restapi.sv.';

var protocol = {
    version: '1.0.0',
    description: 'Web-socket core protocol to data exchanging between ' +
                  'restapi server and supervisor',
    OPERATIONS: {
        workflows: {
            REFRESH_ALL: {name: PREFIX + 'workflow.refresh.all', permissionName: 'view'},
            REFRESH: {name: PREFIX + 'workflow.refresh', permissionName: 'view'},
            ADD: {name: PREFIX + 'workflow.add', permissionName: 'create'},
            UPD: {name: PREFIX + 'workflow.upd', permissionName: 'update'},
            DEL: {name: PREFIX + 'workflow.del', permissionName: 'delete'},
            RUN: {name: PREFIX + 'workflow.run', permissionName: 'update'},
            PAUSE: {name: PREFIX + 'workflow.pause', permissionName: 'update'},
            STOP: {name: PREFIX + 'workflow.stop', permissionName: 'update'},
            REFRESH_ALL_WORKTY_INSTANCES: {name: PREFIX + 'workflow.workty.instance.refresh.all', permissionName: 'view'},
            REFRESH_WORKTY_INSTANCE: {name: PREFIX + 'workflow.workty.instance.refresh', permissionName: 'view'},
            ADD_WORKTY_INSTANCE: {name: PREFIX + 'workflow.workty.instance.add', permissionName: 'update'},
            UPD_WORKTY_INSTANCE: {name: PREFIX + 'workflow.workty.instance.upd', permissionName: 'update'},
            DEL_WORKTY_INSTANCE: {name: PREFIX + 'workflow.workty.instance.del', permissionName: 'update'},
            UPD_WORKTY_INSTANCE_PROPERTY: {name: PREFIX + 'workflow.upd.workty.instance.property', permissionName: 'update'}
        },
        workties : {
            REFRESH_ALL: {name: PREFIX + 'workty.refresh.all', permissionName: 'view'},
            REFRESH: {name: PREFIX + 'workty.refresh', permissionName: 'view'},
            ADD: {name: PREFIX + 'workty.add', permissionName: 'create'},
            UPD: {name: PREFIX + 'workty.upd', permissionName: 'update'},
            DEL: {name: PREFIX + 'workty.del', permissionName: 'delete'},
            ADD_PROPERTY: {name: PREFIX + 'workty.property.add', permissionName: 'update'},
            UPD_PROPERTY: {name: PREFIX + 'workty.property.upd', permissionName: 'update'},
            DEL_PROPERTY: {name: PREFIX + 'workty.property.del', permissionName: 'update'}
        },
        accounts: {
            REFRESH_ALL: {name: PREFIX + 'account.refresh.all', permissionName: 'view'},
            REFRESH: {name: PREFIX + 'account.refresh', permissionName: 'view'},
            ADD: {name: PREFIX + 'account.add', permissionName: 'create'},
            UPD: {name: PREFIX + 'account.upd', permissionName: 'update'},
            DEL: {name: PREFIX + 'account.del', permissionName: 'delete'}
        },
        payments: {
            REFRESH_ALL: {name: PREFIX + 'payment.transaction.refresh.all', permissionName: 'view'},
            REFRESH: {name: PREFIX + 'payment.transaction.refresh', permissionName: 'view'},
            ADD: {name: PREFIX + 'payment.transaction.add', permissionName: 'create'},
            UPD: {name: PREFIX + 'payment.transaction.upd', permissionName: 'update'},
            DEL: {name: PREFIX + 'payment.transaction.del', permissionName: 'delete'}
        },
        AUTHENTICATE: 'authentication',
        AUTHENTICATED: 'authenticated'
    }
};

module.exports = protocol;