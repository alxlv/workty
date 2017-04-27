/**
 * Created by Alex Levshin on 07/06/16.
 */
var settings = {
    srcLocalFoldersPaths: [
        '../../app.js',
        '../../config.js',
        '../../error-handler.js',
        '../../package.json',
        '../../passport-auth.config.js',
        '../../shared{,/**}',
        '../../database{,/**}',
        '!../../database/deployment{,/**}',
        '../../client{,/**}',
        '!../../database/deployment{,/**}',
        '../../supervisor{,/**}',    
        '!../../supervisor/workties-repository{,/**}',
		'!../../supervisor/deployment{,/**}',
        '../../api{,/**}',
        '!../../api/certs{,/**}',
        '!../../api/deployment{,/**}',
        '!../../api/app.js',
        '!../../api/main.js',
        '!../../api/package.json',
        '!../../api/v1/controllers/*.js'
    ]
};

module.exports = settings;
