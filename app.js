'use strict';
/**
 * Created by Alex Levshin on 07/06/16.
 */
// Global require method to resolve paths
global.rootRequire = function(name) {
    return require(__dirname + '/' + name);
};
global.loggerFacility = global.loggerFacility ? global.loggerFacility : 'express';

require('log-timestamp');
var _ = require('lodash');
var parseArgs = require('minimist');
var util = require('util');
var argv = parseArgs(process.argv.slice(2));
var mongoose = require('mongoose');
var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var passport = require('passport');
var session = require('express-session');
var uid = require('uid2');
var config = rootRequire('config');
var RedisStore = require('connect-redis')(session);
var favicon = require('serve-favicon');
var loggerController = rootRequire('api/shared-controllers/logger-controller')();

// Connect to db
var connectionString = argv.dbhostname + '/' + argv.dbname;

// Create new mongodb connection
var db = mongoose.createConnection(connectionString);

function _error(data) {
    var msg = '[express app] ' + util.inspect(data, { depth: null });
    console.error(msg);
    loggerController.error(msg);
}

function _debug(data) {
    var msg = '[express app] ' + util.inspect(data, { depth: null });
    console.log(msg);
    loggerController.debug(msg);
}

db.on('error', function _onDbErrorConnection(err) {
    var msg = 'Connection error:' + util.inspect(err, { depth: null });
    _error(msg);
});

db.once('open', function _onDbOpenConnection() {
    var msg = 'Expressjs app connected to ' + connectionString + ' database successfully';
    _debug(msg);
});

// Store db as global
global.db = global.db ? global.db : db;

var app = express();

// view engine setup
app.set('views', __dirname + '/client/views');
app.set('view engine', 'jade');

app.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.header('Access-Control-Allow-Origin', config.client.getConnectionString());

    // Request methods you wish to allow
    res.header('Access-Control-Allow-Methods', config.client.allowMethods);

    // Request headers you wish to allow
    res.header('Access-Control-Allow-Headers', config.client.allowHeaders);

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.header('Access-Control-Allow-Credentials', config.client.allowCredentials);

    // Pass to next layer of middleware
    next();
});

app.use(favicon(__dirname + '/client/app/assets/img/favicon.png'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(cookieParser());
app.use(session({
    secret: 'workty cat',
    resave: true,
    saveUninitialized: true,
    genid: function(req) {
        return uid(16); // use UUIDs for session IDs
    },
    store: new RedisStore(config.redisstore)
}));
app.use(require('connect-flash')());
app.use(passport.initialize());
app.use(passport.session());
app.use(require('stylus').middleware(__dirname + '/client'));
app.use(express.static(__dirname + '/client'));

// Pass the Express instance to the routes module
rootRequire('client/routes')(app);

// Prevent node warning: possible EventEmitter memory leak detected
process.setMaxListeners(0);

var supervisorApp = rootRequire('supervisor/app').getInstance();

var server = app.listen(config.client.port, function _onServerConnected() {
    _debug('Workty Express server [nodejs ' + process.version + '] listening at ' + this.address().address + ':' + this.address().port);
    supervisorApp.init(this);
});

// On crash
process.on('uncaughtException', function _onProcessExceptionOccurred(e) {
    _error('Workty Express server crash! ' + e);
});

// On kill. SIGTERM (default kill signal) lets the app clean up
process.on('SIGTERM', function _onProcessExceptionKilled() {
    _error('Server got SIGTERM signal!');
    server.close();
});

var errorHandler = require(__dirname + '/error-handler.js');

// Respond to errors and conditionally shut
// down the server. Pass in the server object
// so the error handler can shut it down
// gracefully:
app.use(errorHandler(app));

// Log the error
app.use(function (err, req, res, next) {
    _error(err);
});

module.exports = app;
