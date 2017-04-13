'use strict';
/**
 * Created by Alex Levshin on 18/12/16.
 */
require('log-timestamp');
var util = require('util');
var NodeJsCodeRunner = require('./coderunners/nodejs');
var JavaCodeRunner = require('./coderunners/java');
var PythonCodeRunner = require('./coderunners/python');

var NodeJsType = 'nodejs';
var JavaType = 'java';
var PythonType = 'python';

var CodeRunner = function() {

    return {
        create: function(data) {
            switch (data.worktyProperties.languageType.toLowerCase()) {
                case NodeJsType:
                    return new NodeJsCodeRunner(data);
                case JavaType:
                    return new JavaCodeRunner(data);
                case PythonType:
                    return new PythonCodeRunner(data);
            }
        }
    };
};

module.exports = CodeRunner;