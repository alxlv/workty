'use strict';
/**
 * Created by Alex Levshin on 18/11/16.
 */
var _ = require('lodash');
var DeviceModel = require('../../models/device').defaultModel;
var DeviceStateModel = require('../../models/device-state').defaultModel;
var errorSupervisorController = require('./error-controller')();

var SupervisorDeviceController = function() {
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }

    var _lock = false;

    return {
        getAll: function (data, cb) {
            var params = data;
            var findCriteria = {};
            var query = DeviceModel.find(findCriteria);

            // Sort
            if (params.sort) {
                var sort = params.sort.split(',').join(' ');
                query = query.sort(sort);
            }

            // Include/exclude fields in output
            if (params.fields) {
                var fields = params.fields.split(',').join(' ');
                query = query.select(fields);
            }

            // Embedding
            if (params.embed) {
                var embedFields = params.embed.split(',');
                _.forEach(embedFields, function _onGetEmbedField(embedField) {
                    if (embedField.toLowerCase() === 'state') {
                        query = query.populate('stateId');
                    }
                });
            }

            query.exec().then(function _onDevicesFound(devices) {
                if (!devices) {
                    return cb(null, []);
                }

                cb(null, devices);
            }).end(function _onDevicesFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        getById: function (data, cb) {
            var params = data;

            var findCriteria = {_id: params.id};
            var excludeKeys = ['fields', 'pretty', 'embed', 'id', 'count'];

            var query = DeviceModel.findOne(findCriteria);

            // Filter
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                query = query.where(key).equals(params[key]);
            });

            // Include/exclude fields in output
            if (params.fields) {
                var fields = params.fields.split(',').join(' ');
                query = query.select(fields);
            }

            // Embedding
            if (params.embed) {
                var embedFields = params.embed.split(',');
                _.forEach(embedFields, function _onGetEmbedField(embedField) {
                    if (embedField.toLowerCase() === 'state') {
                        query = query.populate('stateId');
                    }
                });
            }

            query.exec().then(function _onDeviceFound(device) {
                if (!device) {
                    return cb(null, {});
                }

                cb(null, device);
            }).end(function _onDeviceFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        add: function(data, cb) {
            var params = data;
            var self = this;

            // Miss promise like style because of need to catch validation error
            var newDevice = new DeviceModel();
            newDevice.name = params.name;
            newDevice.desc = params.desc || '';
            // Set waiting state
            var state = DeviceStateModel.findByName(params.state);
            state = state ? state : DeviceStateModel.findByName('waiting');
            newDevice.stateId = state._id;
            newDevice.ip4Address = params.ip4Address;
            newDevice.port = params.port;
            newDevice.protocol = params.protocol;
            newDevice.save(function _onDeviceSaved(err, device) {
                if (err) {
                    if (err.name === 'ValidationError') {
                        return cb(errorSupervisorController.createMissingParameterError({ validationError: err, inputParameters: data }));
                    }

                    return cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }

                if (!device) {
                    return cb(errorSupervisorController.createEntityNotSaved({ inputParameters: data }));
                }

                // Need to call getById to get embedded state document
                self.getById({ id: device._id.toString(), embed: params.embed }, function _onDeviceFound(err, newDevice) {
                    cb(err, newDevice);
                });
            });
        },
        update: function (data, cb) {
            var params = data;
            var findCriteria = {_id: params.id};

            var updateCriteria = {};
            var excludeKeys = ['_id', 'id', 'fields', 'created', 'embed'];

            // Update
            _.chain(_.keys(params)).difference(excludeKeys).value().forEach(function _onEachKey(key) {
                // Need to validate required fields manually because of findOneAndUpdate skip it
                switch (key) {
                    case 'name': {
                        if (!params[key]) {
                            var err = {
                                errors: {
                                    name: {
                                        message: 'Path `name` is required.'
                                    }
                                }
                            };

                            return cb(errorSupervisorController.createMissingParameterError({ validationError: err, inputParameters: data }));
                        } else {
                            updateCriteria[key] = params[key];
                        }
                    }
                        break;
                    case 'state': {
                        updateCriteria.stateId = DeviceStateModel.findByName(params[key])._id;
                    }
                        break;
                    default: {
                        updateCriteria[key] = params[key];
                    }
                }
            });


            if (Object.keys(updateCriteria).length === 0) {
                return cb(errorSupervisorController.createBadDigestError({inputParameters: data}));
            }

            var query = DeviceModel.findOneAndUpdate(findCriteria, updateCriteria, {'new': true});

            // Embedding
            if (params.embed) {
                var embedFields = params.embed.split(',');
                _.forEach(embedFields, function _onGetEmbedField(embedField) {
                    if (embedField.toLowerCase() === 'state') {
                        query = query.populate('stateId');
                    }
                });
            }

            query.exec().then(function _onDeviceUpdated(updatedDevice) {
                if (!updatedDevice) {
                    return cb(errorSupervisorController.createEntityNotUpdated({inputParameters: data}));
                }

                cb(null, updatedDevice);
            }).end(function _onDeviceUpdatedError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({err: err, inputParameters: data}));
                }
            });
        },
        del: function (data, cb) {
            var params = data;
            var findCriteria = { _id: params.id };

            var query = DeviceModel.findOne(findCriteria);
            query.exec().then(function _onDeviceFound(device) {
                if (!device) {
                    return cb(errorSupervisorController.createEntityNotDeleted({ inputParameters: data }));
                }

                device.remove();

                cb(null, device);
            }).end(function _onDeviceFoundError(err) {
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        setState: function (data, cb) {
            var params = data;

            if (params.operation === 'borrow') {
                if (_lock) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }
                _lock = true;
            }

            if (params.operation === 'borrow') {
                params.state = 'waiting';
                params.nextState = 'running';
            } else {
                params.state = 'running';
                params.nextState = 'waiting';
            }

            var findCriteria = { };
            if (params.device && params.device.id) {
                findCriteria._id = params.device.id;
            }
            findCriteria.disabled = false;

            var query = DeviceModel.find(findCriteria).populate('stateId');
            var device = null;
            query.exec().then(function _onDevicesFound(devices) {
                if (!devices) {
                    return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                }

                if (params.operation === 'borrow') {
                    // Return ALL devices with state Waiting
                    devices = _.filter(devices, function (device) {
                        return device.stateId.name === params.state;
                    });

                    // No devices to borrow
                    if (!devices || devices.length === 0) {
                        return cb(errorSupervisorController.createEntityNotFound({inputParameters: data}));
                    } else {
                        // Select randomly the device for running
                        var randomIdx = getRandomInt(0, devices.length);
                        device = devices[randomIdx];
                    }
                } else {
                    device = devices[0];
                }

                device.stateId = DeviceStateModel.findByName(params.nextState)._id;
                if (params.desc) {
                    device.desc = params.desc;
                }

                return device.save();
            }).then(function _onDeviceUpdated() {
                // Return with embedded state document
                var findCriteria = {_id: device._id};
                return DeviceModel.findOne(findCriteria).populate('stateId').exec();
            }).then(function _onDeviceFound(device) {
                if (!device) {
                    return cb(null, {});
                }

                _lock = false;
                cb(null, device);
            }).end(function _onDeviceUpdatedError(err) {
                _lock = false;
                if (err) {
                    cb(errorSupervisorController.createGenericUnexpectedError({ err: err, inputParameters: data }));
                }
            });
        },
        getDictionary: function(data, cb) {
            switch (data) {
                case 'device-states':
                    return DeviceStateModel.getAll(cb);
                default:
                    return cb(new Error('The dictionary name ' + data + ' was not found'));
            }
        }
    };
};

module.exports = SupervisorDeviceController;