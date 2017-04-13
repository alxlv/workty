/**
 * Created by Alex Levshin on 17/8/16.
 */
var routes = rootRequire('client/routes/index');
module.exports = function(app) {
    // Catch all route
    app.use('/', routes);
};