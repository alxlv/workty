/**
 * Created by Alex Levshin on 26/11/16.
 */
// In case of running rest api server from main app the third parameter is root folder
var RootFolder = process.env.ROOT_FOLDER;

if (!global.rootRequire) {
    global.rootRequire = function (name) {
        return require(RootFolder + '/' + name);
    };
}

var mongoose = require('mongoose');
var config = rootRequire('config');

before(function(done) {
    // Connect to db
    var connectionString = config.mongodb.getConnectionString(process.env.MONGO_DB_NAME);

    // Create new mongodb connection
    var db = mongoose.createConnection(connectionString);

    db.on('error', function _onDbErrorConnection(err) {
        console.error('Connection error:' + err);
        done();
    });

    db.once('open', function _onDbOpenConnection() {
        console.log('Mocha tests connected to ' + connectionString + ' successfully');
        done();
    });

    global.db = global.db ? global.db : db;
});