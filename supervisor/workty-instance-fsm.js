'use strict';
/**
 * Created by Alex Levshin on 12/11/16.
 */
var _ = require('lodash');
var machina = require('machina');
var util = require('util');

var WorktyInstanceFsm = function (parms) {

    function _error(data) {
        var msg = '[' + parms.contextId + '] [workty instance fsm] [' + parms.id + '] ' + util.inspect(data, { depth: null });
        console.error(msg);
    }

    function _debug(data) {
        var msg = '[' + parms.contextId + '] [workty instance fsm] [' + parms.id + '] ' + util.inspect(data, { depth: null });
        console.log(msg);
    }

    return new machina.Fsm({

        namespace: 'workty',

        result: {},

        _getResult: function() {
            return this.result;
        },

        getContextId: function() {
            return parms.contextId;
        },

        getId: function() {
            return parms.id;
        },

        getWorktyId: function() {
            return parms.worktyId;
        },

        loadState: function() {
            this.transition(parms.state);
        },

        getWorkflowId: function() {
            return parms.workflowId.toString();
        },

        getPropertiesIds: function() {
            return this.propertiesIds;
        },

        // A function that will be executed as soon as the FSM instance has been created.
        // This is the last step of the FSM's constructor function, prior to emitting that a
        // new instance has been created, and transitioning (if applicable) into the initialState.
        initialize: function() {
            this.result = {};
            this.desc = {};
            this.propertiesIds = {};
        },

        // Send data to workflow fsm
        stateChanged: function(data) {
            var inputData = {};
            inputData.id = this.getId();
            inputData.state = this.state;
            inputData.name = this.name;
            inputData.desc = this.desc;
            inputData.propertiesIds = this.propertiesIds;
            if (data) {
                _.assign(inputData, data);
            }
            this.emit('changed', inputData);
        },

        init: function() {
            if (this.state !== 'initial') {
                this.transition('initial');
            }
        },

        wait: function() {
            if (this.state !== 'waiting') {
                this.transition('waiting');
            }
        },

        complete: function() {
            if (this.state !== 'completed') {
                this.transition('completed');
            }
        },

        run: function() {
            if (this.state !== 'running') {
                this.transition('running');
            }
        },

        update: function(data) {
            _.assign(this, data);
            var propertiesIds = [];
            if (data.propertiesIds) {
                _.forEach(data.propertiesIds, function _onEachWorktyProperty(worktyProperty) {
                    propertiesIds.push({
                        id: worktyProperty._id.toString(),
                        name: worktyProperty.name,
                        value: worktyProperty.value
                    });
                });
            }
            this.propertiesIds = propertiesIds;
            this.stateChanged();
        },

        updateProperty: function(data) {
            var property = _.find(this.propertiesIds, function _onEachProperty(property) {
                return property.id === data._id.toString();
            });

            if (property) {
                if (property.name !== data.name || property.value !== data.value) {
                    property.name = data.name;
                    property.value = data.value;
                    this.stateChanged();
                }
            }
        },

        del: function() {
            var inputData = { worktyInstanceDeleted: true };
            this.stateChanged(inputData);
        },

        destroy: function() {
        },

        _onExecuted: function(err, result) {
            this.result = result;
            if (err) {
                this.result.err = err;
            } else {
                this.transition('completed');
            }
        },

        initialState: 'initializing',

        states : {
            initializing: {},

            initial: {
                _onEnter: function() {
                    this.stateChanged();
                }
            },

            waiting : {
                _onEnter: function() {
                    this.stateChanged();
                }
            },

            running : {
                _onEnter: function() {
                    this.handle('execute');
                },

                'execute' : function() {
                    var inputData = {
                        contextId: this.getContextId(),
                        id: this.getId(),
                        workflowId: this.getWorkflowId(),
                        worktyId: this.getWorktyId(),
                        propertiesIds: this.getPropertiesIds(),
                        cb: this._onExecuted,
                        worktyInstance: this
                    };
                    var data = { stage: 'execute', executeData: inputData };
                    this.stateChanged(data);
                }
            },

            completed: {
                _onEnter: function() {
                    var data = {bag: this._getResult.bind(this)};
                    this.stateChanged(data);
                }
            }
        }
    });
};

module.exports = WorktyInstanceFsm;