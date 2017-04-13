'use strict';
/**
 * Created by Alex Levshin on 9/14/16.
 * PUT vs PATCH
 * Using the PATCH method correctly requires clients to submit a document describing the differences between the new and original documents,
 * like a diff file, rather than a straightforward list of modified properties. This means the client has to do a lot of extra work -
 * keep a copy of the original resource, compare it to the modified resource, create a "diff" between the two, compose some type of
 * document showing the differences, and send it to the server. The server also has more work to apply the diff file.
 *  Pragmatic partial updates with PUT
 *    1) Include properties to be updated
 *    2) Don't include properties not to be updated
 *    3) Set properties to be 'deleted' to null
 */
require('log-timestamp');
var config = rootRequire('config');
var util = require('util');
var _ = require('lodash');
var protocol = rootRequire('shared/protocols/v1/restapi-sv.module').OPERATIONS;
var ioClient = require('socket.io-client');
var LoggerController = require('./shared-controllers/logger-controller')();

var api = function(server, version) {
    var prefix = './v' + version.major + '/';
    var apiFullPath = 'api/v' + version.major + '/';
    var WorkflowController = require(prefix + '/controllers/workflow-controller');
    var WorktyController = require(prefix + '/controllers/workty-controller');
    var AccountController = require(prefix + '/controllers/account-controller');
    var PaymentController = require(prefix + '/controllers/payment-controller');

    function _error(data) {
        var msg = util.inspect(data, { depth: null });
        console.error('[rest] ' + msg);
        LoggerController.error(msg);
    }

    function _debug(data) {
        var msg = util.inspect(data, { depth: null });
        console.log('[rest] ' + msg);
        LoggerController.debug(msg);
    }

    // Restful API
    // Bind all routes depend on the config file values
    function _loadApiRoutes() {
        var workflowController;
        var worktyController;
        var accountController;
        var paymentController;
        var connectionString = config.supervisor.getConnectionString();
        // Connect to supervisor server
        var clientSupervisorSocket = ioClient.connect(connectionString);

        var _onSupervisorAuthenticated = function() {
            _debug('Client v.' + version.major + ' ' + version.sub + ' connected to supervisor server over web sockets successfully');

            // Init controllers
            if (!workflowController) {
                workflowController = new WorkflowController(clientSupervisorSocket).init(server, apiFullPath, version.sub);
            }

            if (!worktyController) {
                worktyController = new WorktyController(clientSupervisorSocket).init(server, apiFullPath, version.sub);
            }

            if (!accountController) {
                accountController = new AccountController(clientSupervisorSocket).init(server, apiFullPath, version.sub);
            }

            if (!paymentController) {
                paymentController = new PaymentController(clientSupervisorSocket).init(server, apiFullPath, version.sub);
            }
        };

        var _onSupervisorPing = function() {
            //_debug('Ping from supervisor');
            clientSupervisorSocket.emit('pong', {beat: 1});
        };

        clientSupervisorSocket.on('connect', function _onConnected() {
            clientSupervisorSocket.removeListener(protocol.AUTHENTICATED, _onSupervisorAuthenticated);
            clientSupervisorSocket.on(protocol.AUTHENTICATED, _onSupervisorAuthenticated);

            clientSupervisorSocket.removeListener(_onSupervisorPing);
            clientSupervisorSocket.on('ping', _onSupervisorPing);

            clientSupervisorSocket.on('error', function _onSupervisorConnectedError(err) {
                clientSupervisorSocket.removeListener(protocol.AUTHENTICATED, _onSupervisorAuthenticated);
                clientSupervisorSocket.removeListener(_onSupervisorPing);
                _error('Connection error with supervisor server over web sockets ' + err);
            });

             clientSupervisorSocket.on('disconnect', function _onSupervisorDisconnected(data) {
                clientSupervisorSocket.removeListener(protocol.AUTHENTICATED, _onSupervisorAuthenticated);
                clientSupervisorSocket.removeListener(_onSupervisorPing);
                _error('Disconnected from supervisor server over web sockets ' + data);
            });

            var inputData = {email: config.supervisor.getEmail(), password: config.supervisor.getPassword()};
            clientSupervisorSocket.emit(protocol.AUTHENTICATE, inputData);
        });
    }

    _loadApiRoutes();
};

module.exports = api;

