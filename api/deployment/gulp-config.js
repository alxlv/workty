/**
 * Created by Alex Levshin on 07/06/16.
 */
var settings = {
    srcLocalFoldersPaths: [
        '../../config.js',
		'../../shared{,/**}',
        '../../api/**',
		'!../../api/deployment{,/**}'
    ]
};

module.exports = settings;
