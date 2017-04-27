'use strict';
/**
 * Created by Alex Levshin on 22/1/16.
 */
require('log-timestamp');
var _ = require('lodash');
var config = rootRequire('config');
var util = require('util');
var db = rootRequire('database/db').getInstance(config.supervisor.name);
var LoggerController = rootRequire('shared/controllers/logger-controller')();
var Q = require('q');

var DictonariesContext = function CreateDictionariesContext(contextOwner, contextName, contextLocator) {
    var _id = contextOwner.id;
    var _dictionaries = [];
    var _dictionariesNames = ['workty-validation-states', 'workty-types', 'workty-language-types', 'workty-instance-states', 'device-states', 'acl-role'];

    function _error(data) {
        var msg = '[' + _id + '] [' + contextName + ' context] ' + util.inspect(data, {depth: null});
        console.error(msg);
        LoggerController.error(msg);
    }

    function _debug(data) {
        var msg = '[' + _id + '] [' + contextName + ' context] ' + util.inspect(data, {depth: null});
        console.log(msg);
        LoggerController.debug(msg);
    }

    var _getAll = function() {
        var dictionaryPromises = [];

        _.forEach(_dictionariesNames, function _onEachDictionaryName(dictionaryName) {
            dictionaryPromises.push(_getByName(dictionaryName));
        });

        Q.allSettled(dictionaryPromises).then(function _onSuccess(results) {
            _dictionaries = _.map(results, function _onEachResult(result) {
               return result.value;
            });
        })
        .catch(function _onFailure(err) {
            _error(err);
        });
    };

    var _replaceId = function(obj) {
        var modifiedValue = {};
        if (obj._id) {
            _.forOwn(obj._doc, function(n, key) {
                if (key === '_id') {
                    modifiedValue.id = n;
                } else {
                    modifiedValue[key] = n;
                }
            });

            return modifiedValue;
        } else {
            return obj;
        }
    };

    var _getByName = function(dictionaryName) {
        return new Promise(function (resolve, reject) {
            var inputData = {};
            inputData.name = dictionaryName;
            db.getDictionary(inputData, function _onDictionaryReturned(err, dictionaryValues) {
                if (err) {
                    reject(err);
                }

                var modifiedDictionaryValues = [];

                _.forEach(dictionaryValues, function _onEachDictionaryValue(value) {
                    var modifiedDictionaryValue = _replaceId(value);
                    modifiedDictionaryValues.push(modifiedDictionaryValue);
                });

                resolve({ name: dictionaryName, values: modifiedDictionaryValues });
            });
        });
    };

    // Load dictionaries
    _getAll();

    var _get = function (dictionaryName) {
      var dictionary = _.find(_dictionaries, function _onEachDictionary(dictionary) {
            return dictionary.name === dictionaryName;
      });

      return dictionary.values;
    };

    var _destroy = function() {

    };

    return {
        getId: function() {
            return _id;
        },
        getName: function() {
            return contextName;
        },
        get: _get,
        destroy: _destroy
    };
};

module.exports = DictonariesContext;