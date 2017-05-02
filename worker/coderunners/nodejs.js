'use strict';
/**
 * Created by Alex Levshin on 18/12/16.
 */
require('log-timestamp');
var _ = require('lodash');
var childProcess = require('child_process');
var Zip = require('adm-zip');
var mkdirp = require('mkdirp');
var fs = require('fs');
var parseArgs = require('minimist');
var argv = parseArgs(process.argv.slice(2));
var WORKTY_SHARED_FOLDER_PATH = argv.nfs_path || '/mnt/workty';
var BINARY_EXEC_PATH = argv.binary_exec_path || '/usr/local/bin/node';
var util = require('util');
var loggerController = rootRequire('shared/controllers/logger-controller')();
var os = require('os');

function _error(data) {
    var msg = '[' + os.hostname() + ':' + process.env.PORT + '] [nodejs coderunner] ' + util.inspect(data, { depth: null });
    console.log(msg);
    loggerController.debug(msg);
}

function _debug(data) {
    var msg = '[' + os.hostname() + ':' + process.env.PORT + '] [nodejs coderunner] ' + util.inspect(data, { depth: null });
    console.log(msg);
    loggerController.debug(msg);
}

var NodeJsCodeRunner = function(data) {
    return {
        execute: function(cb) {
            var worktyInstanceProperties = data.worktyInstanceProperties;
            var worktyProperties = data.worktyProperties;
            var folderPath = WORKTY_SHARED_FOLDER_PATH + '/v' + data.version.major + '/' + worktyInstanceProperties.contextId + '/' + worktyInstanceProperties.workflowId + '/' + worktyInstanceProperties.id;
            mkdirp(folderPath, function _onFolderCreated(err) {
                if (err) {
                    _error(err);
                    cb(err);
                } else {
                    var fullPath = folderPath + '/' + worktyProperties.categoryPath;
                    var unzipper = new Zip(worktyProperties.compressedCode);
                    // extracts everything
                    unzipper.extractAllTo(/*target path*/fullPath, /*overwrite*/true);
                    var packageJson;

                    try {
                        if (fs.existsSync(fullPath + '/' + 'package.json')) {
                            // Query the entry
                            var stats = fs.lstatSync(fullPath + '/' + 'package.json');

                            // Is it a file?
                            if (stats.isFile()) {
                                // Get package json
                                packageJson = require(fullPath + '/' + 'package.json');
                            }
                        }

                        //console.log(global.gc);

                        var entryPointModuleFileName = (packageJson && packageJson.main) || worktyProperties.entryPointModuleFileName;

                        if (!entryPointModuleFileName) {
                            cb(new Error('No entry point was found'));
                        } else {
                            // fork(modulePath, [args], [options]
                            // execFile(file, [args], [options], [callback])
                            fullPath += '/' + worktyProperties.name;
                            _debug('Running ' + fullPath + '/' + entryPointModuleFileName);
                            var args = [JSON.stringify(worktyInstanceProperties.propertiesIds)];
                            var child = childProcess.fork(fullPath + '/' + entryPointModuleFileName, args, {execPath: BINARY_EXEC_PATH, execArgv: ['--expose-gc', '--nouse-idle-notification']});

                            child.on('error', function _onProcessError(err) {
                                runGC();
                                cb(err);
                            });

                            child.on('close', function _onProcessClosed(code) {
                                runGC();

                                if (code !== 0) {
                                    _error('process exited with code ' + code);
                                }

                                var inputData = {};
                                inputData.id = worktyInstanceProperties.id;
                                inputData.returnCode = code;
                                cb(null, inputData);
                            });
                        }
                    } catch (e) {
                        runGC();
                        cb(e);
                    }
                }
            });

            var runGC = function() {
                if (typeof global.gc != "undefined" ) {
                    // console.log("Mem Usage Pre-GC "+util.inspect(process.memoryUsage()));
                    global.gc();
                    // console.log("Mem Usage Post-GC "+util.inspect(process.memoryUsage()));
                }
            };
        }
    };
};

module.exports = NodeJsCodeRunner;