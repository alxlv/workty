'use strict';

var path = require('path');
var config = rootRequire('config');
var express = require('express');
var _ = require('lodash');
var router = express.Router();
var supervisor = rootRequire('supervisor/app').getInstance();

function _onDefaultReceived(req, res) {
    res.render('layout', function _onRendered(err, html) {
        if (err) {
            console.error(err);
            res.sendStatus(500);
        } else {
            res.send(html);
        }
    });
}

function _onIncludesReceived(req, res) {
    var fullTemplatePath = '';
    if (req.params.pageName) {
        fullTemplatePath = req.params.pageName + '/';
    }

    if (req.params.controlName) {
        fullTemplatePath += req.params.controlName + '/';
    }

    fullTemplatePath += req.params.name;

    // TODO: Protect from direct navigation (show ERROR)
    res.render('includes/' + fullTemplatePath, function _onRendered(err, html) {
        if (err) {
            console.error(err);
            res.sendStatus(500);
        } else {
            res.send(html);
        }
    });
}

function _onPartialsReceived(req, res) {
    var fullTemplatePath = '';
    if (req.params.pageName) {
        fullTemplatePath = req.params.pageName + '/';
    }

    var splittedUrl = req.url.split('/');
    var index = _.findIndex(splittedUrl, function(subpath) {
        return subpath === 'dialogs';
    });

    if (index > -1) {
        fullTemplatePath += 'dialogs/';
    }

    if (req.params.controlName) {
        fullTemplatePath += req.params.controlName + '/';
    }

    fullTemplatePath += req.params.name;

    // TODO: Protect from direct navigation (show ERROR)
    res.render('partials/' + fullTemplatePath, function _onRendered(err, html) {
        if (err) {
            console.error(err);
            res.sendStatus(500);
        } else {
            res.send(html);
        }
    });
}

// Catch auth routes
require('./auth')(router);

/*
// Catch includes
router.get('/includes/:name', _onIncludesReceived);
router.get('/includes/:pageName/:name', _onIncludesReceived);
router.get('/includes/:pageName/:controlName/:name', _onIncludesReceived);

// Catch partials
router.get('/partials/:name', _onPartialsReceived);
router.get('/partials/:pageName/:name', _onPartialsReceived);
router.get('/partials/:pageName/dialogs/:controlName/:name', _onPartialsReceived);
router.get('/partials/:pageName/:controlName/:name', _onPartialsReceived);
// Catch
router.get('*', _onDefaultReceived);
*/

module.exports = router;

