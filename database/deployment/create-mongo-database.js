'use strict';
/**
 * Created by Alex Levshin on 06/12/16.
 * Input parameters example:
 *  create-mongo-database --rest_api_version_number=1 --version_number=1 --dbhostname=127.0.0.1 --dbname=workty_2
 */
global.rootRequire = function(name) {
    return require('../../' + name);
};

let parseArgs = require('minimist');
let argv = parseArgs(process.argv.slice(2));
let _ = require('lodash');
let mongoose = require('mongoose');
let config = rootRequire('config');
let util = require('util');
let latestVersion = config.restapi.getLatestVersion();
let serverModelsPath = 'api/v' + (argv.rest_api_version_number ? argv.rest_api_version_number : latestVersion.major) + '/models';
let Q = require('q');

// Get build number passed by TeamCity using command prompt
let connectionString = argv.dbhostname + '/' + argv.dbname;

// Connect to Database
let connection = mongoose.createConnection(connectionString);
global.db = global.db ? global.db : connection;

function _error(data) {
    console.error('Create db: ' + util.inspect(data));
    if (connection.readState !== 0) {
        connection.close();
    }
    process.exit(1);
}

function _debug(data) {
    console.log('Create db: ' + util.inspect(data));
}

let WorktyType = rootRequire(serverModelsPath + '/workty-type');
let WorktyTypeModel = connection.model(WorktyType.collectionName, WorktyType.schema);
function _createWorktyTypes() {
    let promises = [];

    _.forEach(['in', 'out', 'inout'], function(typeName) {
        let newWorktyType = new WorktyTypeModel();
        newWorktyType.name = typeName;
        let saveFn = Q.nfbind(newWorktyType.save.bind(newWorktyType));
        promises.push(saveFn());
    });

    return Q.all(promises);
}

let DeviceState = rootRequire(serverModelsPath + '/device-state');
let DeviceStateModel = connection.model(DeviceState.collectionName, DeviceState.schema);
function _createDeviceStates() {
    let promises = [];

    _.forEach(['waiting', 'running', 'disconnected'], (deviceStateName) => {
        let newDeviceState = new DeviceStateModel();
        newDeviceState.name = deviceStateName;
        let saveFn = Q.nfbind(newDeviceState.save.bind(newDeviceState));
        promises.push(saveFn());
    });

    return Q.all(promises);
}

let WorktyInstanceState = rootRequire(serverModelsPath + '/workty-instance-state');
let WorktyInstanceStateModel = connection.model(WorktyInstanceState.collectionName, WorktyInstanceState.schema);
function _createWorktyInstanceStates() {
    let promises = [];

    _.forEach(['initial', 'waiting', 'running', 'completed'], (instanceStateName) => {
        let newWorktyInstanceState = new WorktyInstanceStateModel();
        newWorktyInstanceState.name = instanceStateName;
        let saveFn = Q.nfbind(newWorktyInstanceState.save.bind(newWorktyInstanceState));
        promises.push(saveFn());
    });

    return Q.all(promises);
}

let Device = rootRequire(serverModelsPath + '/device');
let DeviceModel = connection.model(Device.collectionName, Device.schema);
let _devices = [
    {
        name: 'Pi #1_1',
        desc: 'Raspberry PI 3 model B',
        protocol: 'ws',
        ip4Address: '192.168.2.2',
        ip6Address: '',
        port: 3000,
        disabled: false
    },
    {
        name: 'Pi #1_2',
        desc: 'Raspberry PI 3 model B',
        protocol: 'ws',
        ip4Address: '192.168.2.2',
        ip6Address: '',
        port: 3001,
        disabled: false
    },
    {
        name: 'Pi #1_3',
        desc: 'Raspberry PI 3 model B',
        protocol: 'ws',
        ip4Address: '192.168.2.2',
        ip6Address: '',
        port: 3002,
        disabled: false
    },
    {
        name: 'Pi #1_4',
        desc: 'Raspberry PI 3 model B',
        protocol: 'ws',
        ip4Address: '192.168.2.2',
        ip6Address: '',
        port: 3003,
        disabled: false
    },
    {
        name: 'Pi #2',
        desc: 'Raspberry PI model B',
        protocol: 'ws',
        ip4Address: '192.168.2.5',
        ip6Address: '',
        port: 3000,
        disabled: true
    },
    {
        name: 'Pi #3_1',
        desc: 'Raspberry PI 2 model B',
        protocol: 'ws',
        ip4Address: '192.168.2.9',
        ip6Address: '',
        port: 3000,
        disabled: false
    },
    {
        name: 'Pi #3_2',
        desc: 'Raspberry PI 2 model B',
        protocol: 'ws',
        ip4Address: '192.168.2.9',
        ip6Address: '',
        port: 3001,
        disabled: false
    },
    {
        name: 'Pi #3_3',
        desc: 'Raspberry PI 2 model B',
        protocol: 'ws',
        ip4Address: '192.168.2.9',
        ip6Address: '',
        port: 3002,
        disabled: false
    },
    {
        name: 'Pi #3_4',
        desc: 'Raspberry PI 2 model B',
        protocol: 'ws',
        ip4Address: '192.168.2.9',
        ip6Address: '',
        port: 3003,
        disabled: false
    }
];
function _createDevices(deviceState) {
    let promises = [];

    _.forEach(_devices, function (device) {
        let newDevice = new DeviceModel();
        newDevice.name = device.name;
        newDevice.desc = device.desc;
        newDevice.protocol = device.protocol;
        newDevice.ip4Address = device.ip4Address;
        newDevice.ip6Address = device.ip6Address;
        newDevice.port = device.port;
        newDevice.stateId = deviceState;
        newDevice.disabled = device.disabled;
        let saveFn = Q.nfbind(newDevice.save.bind(newDevice));
        promises.push(saveFn());
    });

    return Q.all(promises);
}

let WorktyValidationState = rootRequire(serverModelsPath + '/workty-validation-state');
let WorktyValidationStateModel = connection.model(WorktyValidationState.collectionName, WorktyValidationState.schema);
function _createWorktyValidationStates() {
    let promises = [];

    _.forEach(['in progress', 'approved', 'rejected'], (validationStateName) => {
        let newWorktyValidationState = new WorktyValidationStateModel();
        newWorktyValidationState.name = validationStateName;
        let saveFn = Q.nfbind(newWorktyValidationState.save.bind(newWorktyValidationState));
        promises.push(saveFn());
    });

    return Q.all(promises);
}

let WorktyCategory = rootRequire(serverModelsPath + '/workty-category');
let _worktyCategories = [
	{
        name: 'clouding',
        children: [
            {name: 'google-drive'},
            {name: 'dropbox'}
        ]
    },
    {
        name: 'unsorted',
        children: [
             {name: 'unit-tests'}
        ]
    }
];
let WorktyCategoryModel = connection.model(WorktyCategory.collectionName, WorktyCategory.schema);
function _createWorktyCategories(parent, categories) {
    _.forEach(categories, (category) => {
        let worktyCategory = new WorktyCategoryModel();
        worktyCategory.name = category.name;
        worktyCategory.parentId = parent;
        worktyCategory.save(function (err) {
            if (err) {
                _error(err);
            }
        });

        if (category.children) {
            _createWorktyCategories(worktyCategory, category.children);
        }
    });

    if (parent === null) {
        _debug(WorktyCategory.collectionName + ' collection successfully created');
    }
}

let WorktyLanguageType = rootRequire(serverModelsPath + '/workty-language-type');
let _worktyLanguageTypes = [
    {
        name: 'nodejs',
        children: [
            {name: '4.4.0'}
        ]
    },
    {
        name: 'java',
        children: [
            {name: '8'}
        ]
    },
    {
        name: 'python',
        children: [
            {name: '3.14.1-6'}
        ]
    }
];
let WorktyLanguageTypeModel = connection.model(WorktyLanguageType.collectionName, WorktyLanguageType.schema);
function _createWorktyLanguageTypes(parent, languageTypes) {
    _.forEach(languageTypes, (languageType) => {
        let worktyLanguageType = new WorktyLanguageTypeModel();
        worktyLanguageType.name = languageType.name;
        worktyLanguageType.parentId = parent;
        worktyLanguageType.save(function (err) {
            if (err) {
                _error(err);
            } else {
                if (languageType.children) {
                    _createWorktyLanguageTypes(worktyLanguageType, languageType.children);
                }
            }
        });
    });

    if (parent === null) {
        _debug(WorktyLanguageType.collectionName + ' collection successfully created');
    }
}

let AclPermission = rootRequire(serverModelsPath + '/acl-permission');
let _aclPermissions = [
    'view', 'create', 'update', 'delete'
];
let AclPermissionModel = connection.model(AclPermission.collectionName, AclPermission.schema);
function _createAclPermissions() {
    let promises = [];

    _.forEach(_aclPermissions, (aclPermission) => {
        let newAclPermissionModel = new AclPermissionModel();
        newAclPermissionModel.name = aclPermission;
        let saveFn = Q.nfbind(newAclPermissionModel.save.bind(newAclPermissionModel));
        promises.push(saveFn());
    });

    return Q.all(promises);
}

let AclResource = rootRequire(serverModelsPath + '/acl-resource');
let _aclResources = [
    {name: 'accounts', authTimeout: 1000, refreshingTimeout: 1000, maxReconnectionAttempts: 1},
    {name: 'workflows', authTimeout: 1000, refreshingTimeout: 10000, maxReconnectionAttempts: 1},
    {name: 'workties', authTimeout: 1000, refreshingTimeout: 1000, maxReconnectionAttempts: 1},
    {name: 'devices', authTimeout: 1000, refreshingTimeout: 10000, static: true, maxReconnectionAttempts: 1},
    {name: 'payments', authTimeout: 1000, refreshingTimeout: 1000, maxReconnectionAttempts: 1},
    {name: 'uisettings', authTimeout: 1000, refreshingTimeout: 1000, maxReconnectionAttempts: 1},
    {name: 'dictionaries', authTimeout: 1000, refreshingTimeout: 10000, static: true, maxReconnectionAttempts: 1},
];
let AclResourceModel = connection.model(AclResource.collectionName, AclResource.schema);
function _createAclResources() {
    let promises = [];

    _.forEach(_aclResources, (aclResource) => {
        let newAclResourceModel = new AclResourceModel();
        newAclResourceModel.name = aclResource.name;
        newAclResourceModel.authTimeout = aclResource.authTimeout;
        newAclResourceModel.refreshingTimeout = aclResource.refreshingTimeout;
        newAclResourceModel.maxReconnectionAttempts = aclResource.maxReconnectionAttempts;
        newAclResourceModel.defaultPermissions = aclResource.defaultPermissions;
        if (aclResource.static) {
            newAclResourceModel.static = aclResource.static;
        }
        let saveFn = Q.nfbind(newAclResourceModel.save.bind(newAclResourceModel));
        promises.push(saveFn());
    });

    return Q.all(promises);
}

let AclRole = rootRequire(serverModelsPath + '/acl-role');
let _aclRoles = [
    {
        name: 'admin',
        allows: [
            {resources: 'accounts', permissions: ['view', 'create', 'update', 'delete']},
            {resources: 'workflows', permissions: ['view', 'create', 'update', 'delete']},
            {resources: 'workties', permissions: ['view', 'create', 'update', 'delete']},
            {resources: 'devices', permissions: ['view', 'create', 'update', 'delete']},
            {resources: 'payments', permissions: ['view', 'create', 'update', 'delete']},
            {resources: 'uisettings', permissions: ['view', 'create', 'update', 'delete']},
            {resources: 'dictionaries', permissions: ['view', 'create', 'update', 'delete']}
        ]
    },
    {
        name: 'regular',
        allows: [
            {resources: 'accounts',   permissions: ['view', 'update', 'delete']},
            {resources: 'workflows',  permissions: ['view', 'create', 'update', 'delete']},
            {resources: 'workties',   permissions: ['view']},
            {resources: 'devices',    permissions: []},
            {resources: 'payments',   permissions: ['view', 'create']},
            {resources: 'uisettings', permissions: ['view', 'update']},
            {resources: 'dictionaries', permissions: ['view']}
        ]
    }
];
let AclRoleModel = connection.model(AclRole.collectionName, AclRole.schema);
function _createAclRoles() {
    let promises = [];

    _.forEach(_aclRoles, (aclRole) => {
        let newAclRoleModel = new AclRoleModel();
        newAclRoleModel.name = aclRole.name;
        newAclRoleModel.allows = aclRole.allows;
        let saveFn = Q.nfbind(newAclRoleModel.save.bind(newAclRoleModel));
        promises.push(saveFn());
    });

    return Q.all(promises);
}

function _dropCollection(collectionsNames, collectionName) {
    let deferred = Q.defer();

    if (_.find(collectionsNames, {name: collectionName})) {
        connection.db.dropCollection(collectionName, (err, result) => {
            if (err) {
                deferred.reject(new Error(err));
            } else {
                _debug(collectionName + ' collection dropped');
                deferred.resolve(result);
            }
        });
    } else {
        deferred.resolve({ name: collectionName });
    }

    return deferred.promise;
}

let Account = rootRequire(serverModelsPath + '/account');
let AccountModel = connection.model(Account.collectionName, Account.schema);

connection.on('error', function() {
    _error('Database connection failed.');
});

connection.on('connected', () => {
    _debug('Database connection established!');
    connection.db.listCollections().toArray((err, collectionsNames) => {
        if (err) {
            _error(err);
        } else {
            _dropCollection(collectionsNames, WorktyType.collectionName)
            .then((result) => { return _createWorktyTypes(); }, (err) => { _error(err); })
            .then((result) => { _debug(WorktyType.collectionName + ' collection successfully created'); }, (err) => { _error(err); });
            _dropCollection(collectionsNames, WorktyInstanceState.collectionName)
                .then((result) => {
                    return _createWorktyInstanceStates();
                }, (err) => {
                    _error(err);
                })
                .then((result) => {
                    _debug(WorktyInstanceState.collectionName + ' collection successfully created');
                }, (err) => {
                    _error(err);
                });

            _dropCollection(collectionsNames, WorktyValidationState.collectionName)
                .then((result) => {
                    return _createWorktyValidationStates();
                }, (err) => {
                    _error(err);
                })
                .then((result) => {
                    _debug(WorktyValidationState.collectionName + ' collection successfully created');
                }, (err) => {
                    _error(err);
                });

            _dropCollection(collectionsNames, WorktyCategory.collectionName)
                .then((result) => {
                    _createWorktyCategories(null, _worktyCategories);
                }, (err) => {
                    _error(err);
                });

            _dropCollection(collectionsNames, WorktyLanguageType.collectionName)
                .then((result) => {
                    _createWorktyLanguageTypes(null, _worktyLanguageTypes);
                }, (err) => {
                    _error(err);
                });

            _dropCollection(collectionsNames, AclPermission.collectionName)
                .then((result) => {
                    return _createAclPermissions();
                }, (err) => {
                    _error(err);
                })
                .then((result) => {
                    _debug(AclPermission.collectionName + ' collection successfully created');
                }, (err) => {
                    _error(err);
                });

            _dropCollection(collectionsNames, AclResource.collectionName)
                .then((result) => {
                    return _createAclResources();
                }, (err) => {
                    _error(err);
                })
                .then((result) => {
                    _debug(AclResource.collectionName + ' collection successfully created');
                }, (err) => {
                    _error(err);
                });

            _dropCollection(collectionsNames, AclRole.collectionName)
                .then((result) => {
                    return _createAclRoles();
                }, (err) => {
                    _error(err);
                })
                .then((result) => {
                    _debug(AclRole.collectionName + ' collection successfully created');
                }, (err) => {
                    _error(err);
                });


            AccountModel.findOne({
                name: config.supervisor.getName(),
                email: config.supervisor.getEmail()
            }, (err, account) => {
                if (err) {
                    _error(err);
                } else {
                    let msg;

                    if (account) {
                        msg = 'updated';
                    } else {
                        account = new AccountModel();
                        msg = 'created';
                    }

                    account.oauthID = '';
                    account.name = config.supervisor.getName();
                    account.email = config.supervisor.getEmail();
                    account.password = config.supervisor.getPassword();
                    account.aclRoleNames = [_aclRoles[0].name]; // admin
                    account.save((err) => {
                        if (err) {
                            _error(err);
                        } else {
                            _debug(Account.collectionName + ' collection successfully ' + msg);

                            // Create devices and device states
                            _dropCollection(collectionsNames, DeviceState.collectionName)
                            .then((result) => {
                                _debug(DeviceState.collectionName + ' collection successfully created');
                                return _dropCollection(collectionsNames, Device.collectionName);
                            }, (err) => {
                                _error(err);
                            })
                            .then((result) => {
                                return _createDeviceStates();
                            }, (err) => {
                                _error(err);
                            })
                            .then((deviceStates) => {
                                let deviceWaitingState;
                                _.forEach(deviceStates, (deviceState) => {
                                    if (deviceState[0].name === 'waiting') {
                                        deviceWaitingState = deviceState[0];
                                    }
                                });
                                return _createDevices(deviceWaitingState);
                            }, (err) => {
                                _error(err);
                            })
                            .then((devices) => {
                                _debug(Device.collectionName + ' collection successfully created');
                                if (connection.readyState !== 0) {
                                    connection.close();
                                }
                                process.exit(0);
                            });
                        }
                    });
                }
            });
        }
    });
});