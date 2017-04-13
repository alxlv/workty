'use strict';
/**
 * Created by Alex Levshin on 06/06/16.
 */
// Global require method to resolve paths
if (!global.rootRequire) {
    global.rootRequire = function (name) {
        return require(__dirname + '/' + name);
    };
}

var PROTOCOL_SUBFOLDER_PATH = 'protocols/v1/worker-sv.module';

require('log-timestamp');
var parseArgs = require('minimist');
var argv = parseArgs(process.argv.slice(2));
var loggerController = rootRequire('shared-controllers/logger-controller')();
var protocol;
if (argv.shared_folder_path) {
    protocol = require(argv.shared_folder_path + '/' + PROTOCOL_SUBFOLDER_PATH).OPERATIONS;
} else {
    protocol = rootRequire(PROTOCOL_SUBFOLDER_PATH).OPERATIONS;
}
var cluster = require('cluster');
var CodeRunnerFactory = require('./coderunner')();
var os = require('os');
var cpus = os.cpus().length;
var util = require('util');

function _error(data) {
    var msg = '[' + os.hostname() + ':' + process.env.PORT + '] [app] ' + util.inspect(data, { depth: null });
    console.error(msg);
    loggerController.error(msg);
}

function _debug(data) {
    var msg = '[' + os.hostname() + ':' + process.env.PORT + '] [app] ' + util.inspect(data, { depth: null });
    console.log(msg);
    loggerController.debug(msg);
}

if (cluster.isMaster) {
    var numCPUs = argv.numCPUs || cpus;
    _debug('The count of CPUs ' + numCPUs);

    var DEFAULT_PORT = 3000;

    // Fork workers
    for (var i = 0; i < numCPUs; i++) {
        var args = {};
        args.PORT = DEFAULT_PORT + i;
        cluster.fork(args);
    }

    cluster.on('online', function(worker) {
        _debug(worker.process.pid + ' is online');
    });

    cluster.on('exit', function(worker, code, signal) {
       _debug(worker.process.pid + ' died ' + signal || code + ', restarting');
        cluster.fork();
    });
} else {
    var io = require('socket.io')(process.env.PORT);

    io.on('connection', function _onClientConnect(socket) {
        _debug('Client connected');

        var _onGetConfiguration = function() {
            _debug('Heartbeat');
            var data = {};
            data.pid = process.pid;
            data.ipAddress = os.networkInterfaces()['eth0'];
            data.port = process.env.PORT;
            data.hostname = os.hostname();
            data.protocolVersion = protocol.version;
            data.cpus = os.cpus();
            data.uptime = os.uptime();
            data.info = os.type() + ' ' + os.platform() + ' ' + os.arch() + ' ' + os.release();
            socket.emit(protocol.SEND_CONFIGURATION, data);
        };

        var _onExecute = function(data) {
            var codeRunner = CodeRunnerFactory.create(data);
            codeRunner.execute(function _onExecuted(err, result) {
                if (err) {
                    _error(err);
                    result.err = err;
                }

                socket.emit(protocol.COMPLETED, result);
            });
        };

        var _onError = function(err) {
            _error('Error ' + err);
            //socket.emit(protocolOperations.ERROR, { err: err });
        };

        var _onDisconnect = function(data) {
            _error('Disconnected ' + data);
            socket.removeAllListeners();
        };

        socket.on(protocol.GET_CONFIGURATION, _onGetConfiguration);
        socket.on(protocol.EXECUTE, _onExecute);
        socket.on('error', _onError);
        socket.on('disconnect', _onDisconnect);
    });
}