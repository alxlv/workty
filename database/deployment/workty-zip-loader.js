/**
 * Created by Alex Levshin on 26/3/16.
 */
'use strict';

global.rootRequire = function(name) {
    return require('../../' + name);
};

let parseArgs = require('minimist');
let argv = parseArgs(process.argv.slice(2));
var _ = require('lodash');
var mongoose = require('mongoose');
var config = rootRequire('config');
var util = require('util');
var fs = require('fs');
let path = require('path');
var latestVersion = config.restapi.getLatestVersion();
var initialDir = 'supervisor/workties-repository/';
let serverModelsPath = 'api/v' + (argv.rest_api_version_number ? argv.rest_api_version_number : latestVersion.major) + '/models';
var UPDATE_EXISTING = true;

function _error(data) {
    console.error('Import workties into DB: ' + util.inspect(data));
    if (connection.readState !== 0) {
        connection.close();
    }
    process.exit(1);
}

function _debug(data) {
    console.log('Import workties into DB: ' + util.inspect(data));
}

var walkSync = function(dir, filelist) {
    var files = fs.readdirSync(dir);
    filelist = filelist || [];

    files.forEach((file) => {
        if (fs.statSync(dir + '/' + file).isDirectory()) {
            filelist = walkSync(dir + file + '/', filelist);
        }
        else {
            var splittedFilename = (/[.]/.exec(file)) ? /[^.]+$/.exec(file) : undefined;
            if (splittedFilename && splittedFilename[0] === 'zip') {
                var cutDir = dir.replace(initialDir, '');
                filelist.push({ name: file, directory: cutDir.substring(0, cutDir.length - 1) });
            }
        }
    });

    return filelist;
};

// Get build number passed by TeamCity using command prompt
let connectionString = argv.dbhostname + '/' + argv.dbname;

// Connect to Database
let connection = mongoose.createConnection(connectionString);
global.db = global.db ? global.db : connection;

var Account = rootRequire(serverModelsPath + '/account');
var Workty = rootRequire(serverModelsPath + '/workty');
var WorktyType = rootRequire(serverModelsPath + '/workty-type');
var WorktyCategory = rootRequire(serverModelsPath + '/workty-category');
var WorktyLanguageType = rootRequire(serverModelsPath + '/workty-language-type');
var WorktyValidationState = rootRequire(serverModelsPath + '/workty-validation-state');
var WorktyPropertyState = rootRequire(serverModelsPath + '/workty-property');
let WorktyTypeModel = connection.model(WorktyType.collectionName, WorktyType.schema);
let AccountModel = connection.model(Account.collectionName, Account.schema);
let WorktyLanguageTypeModel = connection.model(WorktyLanguageType.collectionName, WorktyLanguageType.schema);
let WorktyCategoryModel = connection.model(WorktyCategory.collectionName, WorktyCategory.schema);
let WorktyValidationStateModel = connection.model(WorktyValidationState.collectionName, WorktyValidationState.schema);
let WorktyPropertyModel = connection.model(WorktyPropertyState.collectionName, WorktyPropertyState.schema);
let WorktyModel = connection.model(Workty.collectionName, Workty.schema);
// All models should be loaded on invoking callback
connection.on('error', function() {
    _error('Database connection failed.');
});

function _createProperty(property) {
    return new Promise((resolve, reject) => {
        try {
            // TODO: Upsert?
            let worktyProperty = new WorktyPropertyModel();
            worktyProperty.name = property.name;
            worktyProperty.value = property.value;
            worktyProperty.save();
            resolve(worktyProperty._id);
        } catch (e) {
            reject(e);
        }
    });
}

function _createWorkty(account, file) {
    return new Promise((resolve, reject) => {
        var splittedDirectory = file.directory.split("/");
        var splittedName = file.name.split('.');

        var newWorkty = new WorktyModel();
        newWorkty.name = splittedName.slice(0, -1).join('.');
        newWorkty.desc = '';
        newWorkty.accountId = account;
        newWorkty.typeId = WorktyTypeModel.findByName('inout');
        // TODO: Find child categories
        newWorkty.categoryId = WorktyCategoryModel.findByName(splittedDirectory[splittedDirectory.length - 1]);
        newWorkty.languageTypeId = WorktyLanguageTypeModel.findBy({name: splittedDirectory[1]});
        newWorkty.validationStateId = WorktyValidationStateModel.findByName('approved');
        // TODO: Set default value for each type of language
        newWorkty.entryPointModuleFileName = 'app.js';
        newWorkty.compressedCode = fs.readFileSync(initialDir + file.directory + '/' + file.name);
        newWorkty.price = 0;
        newWorkty.discountPercent = 0;
        newWorkty.template = true;

        const filePath = path.parse(file.name);
        const properties = JSON.parse(fs.readFileSync(initialDir + file.directory + '/' + filePath.name + '/properties.json'));
        let createPropertyPromises = [];
        properties.forEach((property) => {
            createPropertyPromises.push(_createProperty(property));
        });

        Promise.all(createPropertyPromises).then((values) => {
            newWorkty.propertiesIds = values;
            //_debug(newWorkty);
            // Search duplicates
            WorktyModel.findOne({
                accountId: account,
                name: newWorkty.name,
                categoryId: newWorkty.categoryId,
                languageTypeId: newWorkty.languageTypeId
            }, (err, workty) => {
                if (err) {
                    reject(err);
                } else {
                    // No duplicates found
                    if (!workty) {
                        // Save new workty
                        newWorkty.save(function _onWorktySaved(err, savedWorkty) {
                            if (err) {
                                reject(err);
                            } else {
                                _debug('Workty with name ' + savedWorkty.name + ' was successfully uploaded');
                                resolve(savedWorkty);
                            }
                        });
                    } else {
                        var msg = 'Workty with name ' + newWorkty.name + ' is already added. ';
                        if (!UPDATE_EXISTING) {
                            _debug(msg);
                            resolve(workty);
                        } else {
                            msg += 'Update it. Set UPDATE_EXISTING to false if you want to disable automatic updated. ';
                            msg += 'The new length of the file is ' + newWorkty.compressedCode.length + ' bytes';
                            _debug(msg);
                            workty.desc = newWorkty.desc;
                            workty.compressedCode = newWorkty.compressedCode;
                            workty.price = newWorkty.price;
                            workty.discountPercent = newWorkty.discountPercent;
                            workty.entryPointModuleFileName = newWorkty.entryPointModuleFileName;
                            workty.typeId = newWorkty.typeId;
                            workty.validationStateId = newWorkty.validationStateId;
                            workty.template = newWorkty.template;
                            workty.propertiesIds = newWorkty.propertiesIds;
                            workty.save();

                            resolve(workty);
                        }
                    }
                }
            });
        });
    }, (reason) => {
        _error(reason);
    });
}

connection.on('connected', () => {
    _debug('Database connection established!');
    WorktyTypeModel.getAll((err, worktyTypes) => {
        if (err) {
            _error(err);
        } else {
            // Find supervisor account
            AccountModel.findOne({
                name: config.supervisor.name,
                email: config.supervisor.email
            }, (err, account) => {
                if (err) {
                    _error(err);
                } else {
                    if (account) {
                        var filelist = walkSync(initialDir);
                        if (filelist.length === 0) {
                            _debug('No files were found');
                            process.exit(0);
                        }

                        let loadPromises = [];
                        filelist.forEach((file) => {
                           loadPromises.push(_createWorkty(account, file));
                        });

                        Promise.all(loadPromises).then((values) => {
                            _debug('The workties ' + filelist.length + ' were successfully uploaded');
                            if (connection.readyState !== 0) {
                                connection.close();
                            }
                            process.exit(0);
                        }, (reason) => {
                            _error(reason);
                        });
                    }
                }
            });
        }
    });
});