'use strict';
/**
 * Created by Alex Levshin on 9/14/16.
 */
// In case of running rest api server from main app the third parameter is root folder
var parseArgs = require('minimist');
var argv = parseArgs(process.argv.slice(2));

if (!global.rootRequire) {
    global.rootRequire = function (name) {
        return require(argv.root_folder + '/' + name);
    };
}

global.loggerFacility = global.loggerFacility ? global.loggerFacility : 'rest';

require('log-timestamp');
var restify = require('restify');
var fs = require('fs');
var util = require('util');
var config = rootRequire('config');
var parseArgs = require('minimist');
var argv = parseArgs(process.argv.slice(2));
var mongoose = require('mongoose');
var majorVersion = argv.major_version ? argv.major_version : 1;
var subVersion = argv.sub_version ? argv.sub_version : '2016.10.1';
var loggerController = require('./shared-controllers/logger-controller')();

function _error(data) {
    var msg = util.inspect(data, { depth: null });
    console.error('[rest] ' + msg);
    loggerController.error(msg.toString());
}

function _debug(data) {
    var msg = util.inspect(data, { depth: null });
    console.log('[rest] ' + msg);
    loggerController.debug(msg);
}

// Connect to db
var connectionString = argv.dbhostname + '/' + argv.dbname;
// Create new mongodb connection
var db = mongoose.createConnection(connectionString);

db.on('error', function _onDbErrorConnection(err) {
    _error('Connection error:' + err);
});

db.once('open', function _onDbOpenConnection() {
    _debug('Connected to ' + connectionString + ' database successfully');
});

// Store db as global
global.db = global.db ? global.db : db;

function _prettyJsonFormatter(req, res, body, cb) {
    // TODO: Wrong request header leads to crash of server - curl -u 'Alexander  Levshin':'pwd' -k -v 'https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f7f/workties&pretty=true&sort=created&page_num=1&per_page=3'
    if (!body) {
        if (res.getHeader('Content-Length') === undefined &&
            res.contentLength === undefined) {
            res.setHeader('Content-Length', 0);
        }

        return null;
    }

    if (body instanceof Error) {
        // snoop for RestError or HttpError, but don't rely on instanceof
        if ((body.restCode || body.httpCode) && body.body) {
            body = body.body;
        } else {
            body = {
                message: body.message
            };
        }
    }

    if (Buffer.isBuffer(body)) {
        //body = body.toString('base64');
        return cb(null, body.toString('base64'));
    }

    var prettify = true;
    if (req.params && req.params.pretty) {
        if (req.params.pretty === 'false') {
            prettify = false;
        }
    }

    var data;
    if (prettify === true) {
        data = JSON.stringify(body, null, 2);
    } else {
        data = JSON.stringify(body);
    }

    if (res.getHeader('Content-Length') === undefined &&
        res.contentLength === undefined) {
        res.setHeader('Content-Length', Buffer.byteLength(data));
    }

    return cb(null, data);
}

var server = restify.createServer({
    formatters: {
        'application/json': _prettyJsonFormatter
    },
    certificate: fs.readFileSync(__dirname + '/certs/workty.crt'),
    key: fs.readFileSync(__dirname + '/certs/workty.key'),
    name: 'Workty Rest API v.' + majorVersion + ' ' + subVersion + ' server'
});

// Plugin is used to parse the HTTP query string (i.e., /action?params=one,two).
server.use(restify.authorizationParser());
server.use(restify.gzipResponse());
server.use(restify.acceptParser(server.acceptable));
// The parsed content will always be available in req.query
server.use(restify.queryParser());
// Takes care of turning your request data into a JavaScript object on the server automatically
server.use(restify.bodyParser());
// Configures CORS support in the application
server.use(restify.CORS());
// Requests throttling
server.use(restify.throttle({
    burst: config.restapi.throttleConfig.burst, // If available, the amount of requests to burst to
    rate: config.restapi.throttleConfig.rate, // Steady state number of requests/second to allow
    username: true,
    overrides: {
        '127.0.0.1': {
            burst: 0,
            rate: 0
        }
    }
}));

server.listen(config.restapi.port, function _onServerConnected() {
    _debug(server.name + ' listening at ' + server.url);
});

require('./main')(server, {major: majorVersion, sub: subVersion});