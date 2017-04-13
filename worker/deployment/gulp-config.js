/**
 * Created by Alex Levshin on 07/06/16.
 */
var settings = {
    srcLocalFoldersPaths: [
        '../../config.js',
        '../../passport-auth.config.js',
        '../../api/**/logger.js',
        '../../api/**/logger-controller.js',
        '../../worker/**',
        '!../../worker/deployment{,/**}',
        '../../shared/**/worker-sv.module.js'
    ]
};

module.exports = settings;
