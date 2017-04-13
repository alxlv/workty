/**
 * Created by Alex Levshin on 17/8/16.
 */
var errorHandler = require('express-error-handler');

module.exports = function(app) {
    var handler = errorHandler({
        server: app,
        handlers: {
            '404': function _onError404(err, req, res, next) {
                // do some custom thing here...
                console.log('Handler 404!');
                next(err);
            },
            '500': function _onError500(err, req, res, next) {
                // do some custom thing here...
                console.log('Handler 500!');
                next(err);
            }
        }
    });

    // After all your routes...
    // Pass a 404 into next(err)
    app.use(errorHandler.httpError(404));

    return handler;
};