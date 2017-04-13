'use strict';
/**
 * Created by Alex Levshin on 12/11/16.
 */
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;
var WorktyInstanceFsm = require('./workty-instance-fsm');
var util = require('util');
var LoggerController = rootRequire('api/shared-controllers/logger-controller')();

var Workflow = function (parms) {
    var _worktiesInstances = [];
    var _worktyInstancePosition = 0;
    var self = this;
    var _stopped = false;

    // Add on/off, etc methods for the instance
    EventEmitter.call(this);

    function _error(data) {
        var msg = '[' + self.getContextId() + '] [workflow emitter] ' + '[' + self.getId() + ']' + util.inspect(data, { depth: null });
        console.error(msg);
        LoggerController.error(msg);
    }

    function _debug(data) {
        var msg = '[' + self.getContextId() + '] [workflow emitter] ' + '[' + self.getId() + ']' + util.inspect(data, { depth: null });
        console.log(msg);
        LoggerController.debug(msg);
    }

    function _worktyInstanceStateChanged(result) {
        var worktyInstance = _.find(_worktiesInstances, function _onEachWorktyInstance(worktyInstance) {
            return worktyInstance.getId() === result.id;
        });

        if (worktyInstance) {
            var inputData = {};
            var runNextWorktyInstance = false;
            _.assign(inputData, result);

            // The workflow was stopped
            if (_stopped === true) {
                _stateChanged(inputData);
                if (result.state !== 'initial') {
                    _init();
                }

                return;
            }

            if (!result.worktyInstanceDeleted) {
                worktyInstance.state = result.state;

                switch (result.state) {
                    case 'initial':
                        {
                        }
                        break;
                    case 'waiting':
                        {
                        }
                        break;
                    case 'running':
                        {
                            if (result.stage === 'execute') {
                                // Execute code on worker
                                self.emit('worktyInstanceExecute', {executeData: result.executeData});
                            }
                        }
                        break;
                    case 'completed':
                        {
                            if (_worktyInstancePosition < _worktiesInstances.length) {
                                runNextWorktyInstance = true;
                            } else {
                                _debug('Completed, workty instance #' + _worktyInstancePosition + ', total ' + _worktiesInstances.length);
                                inputData.workflowCompleted = true;
                            }
                        }
                        break;
                }

                _stateChanged(inputData);

                if (runNextWorktyInstance) {
                    _runWorktyInstance();
                }
            }
        }
    }

    // Send data to workflows context
    function _stateChanged(data) {
        var inputData = {};
        inputData.id = self.getId();
        inputData.name = self.name;
        inputData.desc = self.desc;
        inputData.requestId = self.getRequestId();

        if (data) {
            if (data.workflowCompleted) {
                inputData.workflowCompleted = true;
                delete data.workflowCompleted;
            }

            inputData.worktyInstance = data;
        }

        // Save input parameters
        //_debug(inputData);

        self.emit('changed', inputData);
    }

    function _init(setState) {
        // Is empty workflow?
        if (_worktiesInstances.length === 0) {
            _stateChanged();
        } else {
            // Set states for workties instances
            _.forEach(_worktiesInstances, function _onEachWorktyInstance(worktyInstance) {
                if (setState) {
                    // Set state from db
                    worktyInstance.loadState();
                } else {
                    worktyInstance.init();
                }
            });
        }
    }

    function _wait() {
        if (_worktiesInstances[_worktyInstancePosition]) {
            var worktyInstance = _worktiesInstances[_worktyInstancePosition];
            worktyInstance.wait();
        }
    }

    function _run() {
        // Find first workty instance in waiting state
        var waitingIndex = _.findIndex(_worktiesInstances, function _onWorktyInstanceIndexFound(worktyInstance) { return worktyInstance.state === 'waiting'; });
        if (waitingIndex !== -1) {
            _worktyInstancePosition = waitingIndex;
        } else {
            // All workties instance has initial state than run the first workty instance
            _worktyInstancePosition = 0;
        }

        _runWorktyInstance();
    }

    // Run workty instance
    function _runWorktyInstance() {
        var worktyInstance = _worktiesInstances[_worktyInstancePosition];
        _debug('Run workty instance #' + (_worktyInstancePosition + 1) + ', total ' + _worktiesInstances.length);
        if (worktyInstance) {
            _worktyInstancePosition++;
            worktyInstance.run();
        }
    }

    this.getId = function() {
        return parms.id;
    };

    this.getContextId = function() {
        return parms.contextId;
    };

    this.getRequestId = function() {
        return parms.requestId;
    };

    this.getWorktiesInstances = function() {
        return _worktiesInstances;
    };

    this.addWorktyInstance = function(worktyInstance) {
        var worktyInstanceParms = {
            contextId: parms.contextId,
            id: worktyInstance._id.toString(),
            worktyId: worktyInstance.worktyId.toString(),
            workflowId: worktyInstance.workflowId.toString(),
            created: worktyInstance.created
        };

        var newWorktyInstance = new WorktyInstanceFsm(worktyInstanceParms);
        var inputData = {name: worktyInstance.name, desc: worktyInstance.desc, propertiesIds: worktyInstance.propertiesIds, state: worktyInstance.stateId.name};
        newWorktyInstance.on('changed', _worktyInstanceStateChanged);
        newWorktyInstance.update(inputData);
        _worktiesInstances.push(newWorktyInstance);

        return newWorktyInstance;
    };

    this.updateWorktyInstance = function(worktyInstance) {
        var existedWorktyInstance = _.find(_worktiesInstances, function _onEachWorktyInstance(wi) {
            return wi.getId() === worktyInstance._id.toString();
        });

        if (existedWorktyInstance) {
            var inputData = { desc: worktyInstance.desc, propertiesIds: worktyInstance.propertiesIds, state: worktyInstance.stateId.name  };
            existedWorktyInstance.update(inputData);
        }
    };

    this.delWorktyInstance = function(worktyInstanceId) {
        var existedWorktyInstance = _.find(_worktiesInstances, function _onEachWorktyInstance(worktyInstance) {
            return worktyInstance.getId() === worktyInstanceId;
        });

        if (existedWorktyInstance) {
            existedWorktyInstance.del();
            _worktiesInstances = _.without(_worktiesInstances, existedWorktyInstance);
        }
    };

    this.init = function() {
        _init(true);
    };

    this.run = function() {
        _stopped = false;
        _run();
    };

    this.pause = function(data) {
        _stopped = false;
        _wait();
    };

    this.stop = function() {
        _stopped = true;
        _init();
    };

    this.update = function(data) {
        self.name = data.name;
        self.desc = data.desc;
        _.forEach(data.worktiesInstancesIds, function _onEachWorktyInstance(worktyInstance) {
           self.updateWorktyInstance(worktyInstance);
        });
    };

    this.destroy = function() {
        // TODO: Why self does not work?
        //self.off('changed');

        // Clean up workties instances
        _.forEach(_worktiesInstances, function _onEachWorktyInstance(worktyInstance) {
            worktyInstance.destroy();
        });
    };
};

util.inherits(Workflow, EventEmitter);

module.exports = Workflow;