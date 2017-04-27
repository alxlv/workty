/**
 * Created by Alex Levshin on 07/06/16.
 */
var settings = {
    srcLocalFoldersPaths: [
        '../../config.js',
        '../../passport-auth.config.js',
        '../../worker/**',
        '!../../worker/deployment{,/**}',
        '../../shared{,/**}',
        '!../../shared/**/client-sv-accounts.module.js',
        '!../../shared/**/client-sv-devices.module.js',
        '!../../shared/**/client-sv-payments.module.js',
        '!../../shared/**/client-sv-ui-settings.module.js',
        '!../../shared/**/client-sv-workflows.module.js',
        '!../../shared/**/client-sv-workties.module.js',
        '!../../shared/**/restapi-sv.module.js'
    ]
};

module.exports = settings;
