'use strict';
/**
 * Created by Alex Levshin on 25/8/16.
 */
var path = require('path');
var FacebookStrategy = require('passport-facebook').Strategy;
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var LocalStrategy = require('passport-local').Strategy;
var passport = require('passport');
var config = rootRequire('config');
var url = require('url');
var db = rootRequire('database/db').getInstance(config.supervisor.name);
var crypto = require('crypto');

var AuthRoutes = function(router) {

    // serialize and deserialize
    passport.serializeUser(function _onSerialized(user, done) {
        done(null, { id: user._id, name: user.name, email: user.email });
    });

    passport.deserializeUser(function _onDeserialized(user, done) {
        var data = {};
        data.id = user.id;
        db.getAccountById(data, function(err, account) {
            if (err) {
                done(err);
            } else {
                done(null, account);
            }
        });
    });

    var local = config.auth.getProvider('local');

    // Local db
    if (local !== null) {
        passport.use(new LocalStrategy(local,
            function _onLocalAuthReturned(email, password, done) {
                // asynchronous verification
                var data = {};
                data.email = email;
                data.password = password;
                db.authenticateByEmail(data, function (err, account) {
                    if (err) {
                        done(err);
                    } else {
                        done(null, account);
                    }
                });
            }
        ));

        // Add routes
        router.post('/auth/login', function _onLoginPost(req, res, next) {
            passport.authenticate('local', function(err, user, info) {
                if (err || !user) {
                    return res.status(401).json(err);
                }

                req.logIn(user, function(err) {
                    if (err) {
                        return res.status(401).json(err);
                    }

                    res.json({ _id: user._id, email: user.email, name: user.name });
                });
            })(req, res, next);
        });
    }

    var facebook = config.auth.getProvider('facebook');
    var entryURL;
    // Facebook
    if (facebook !== null) {
        var oldCallbackURL = facebook.callbackURL;
        facebook.callbackURL = config.client.getConnectionString() + facebook.callbackURL;

        passport.use(new FacebookStrategy(facebook,
            function _onFacebookAuthReturned(accessToken, refreshToken, profile, done) {
                var data = {};
                data.profile = profile;
                db.authenticateByProfile(data, function _onAuthByProfileReturned(err, account) {
                    if (err) {
                        var inputData = {};
                        inputData.oauthID = data.profile.id;
                        inputData.name = data.profile.displayName;
                        if (!data.profile.email) {
                            done(new Error("The email value should exist"));
                        } else {
                            db.addAccount(inputData, function _onAccountAdded(err, newAccount) {
                                if (err) {
                                    done(err);
                                } else {
                                    done(null, newAccount);
                                }
                            });
                        }
                    } else {
                        done(null, account);
                    }
                });
            }
        ));

        // Add routes
        entryURL = oldCallbackURL.split(path.sep).slice(0, -1).join(path.sep);
        router.get(entryURL, passport.authenticate('facebook'), function (req, res) {
        });


        router.get('/auth/facebook', passport.authenticate('facebook'));

        router.get(oldCallbackURL,
            passport.authenticate('facebook', { failureRedirect: '/login' }),
            function(req, res) {
                //console.log('suc');
                res.redirect('/');
            });
    }

    var google = config.auth.getProvider('google');
    // Google
    if (google !== null) {
         var oldReturnURL = google.returnURL;
         google.returnURL = config.client.getConnectionString() + google.returnURL;

        passport.use(new GoogleStrategy(google,
            function _onGoogleAuthReturned(accessToken, refreshToken, profile, done) {
                // To keep the example simple, the user's Google profile is returned to
                // represent the logged-in user.  In a typical application, you would want
                // to associate the Google account with a user record in your database,
                // and return that user instead.
                var data = {};
                data.profile = {};
                data.profile.id = url.parse(accessToken, true).query.id;
                data.profile.displayName = refreshToken.displayName;
                console.log(data);
                db.authenticateByProfile(data, function _onAuthByProfileReturned(err, account) {
                    if (err) {
                        var inputData = {};
                        inputData.oauthID = data.profile.id;
                        inputData.name = data.profile.displayName;
                        if (refreshToken.emails && refreshToken.emails.length > 0) {
                            inputData.email = refreshToken.emails[0].value;
                            db.addAccount(inputData, function _onAccountAdded(err, newAccount) {
                                if (err) {
                                    done(err);
                                } else {
                                    done(null, newAccount);
                                }
                            });
                        } else {
                            done(new Error("The email value should exist"));
                        }
                    } else {
                        done(null, account);
                    }
                });
            }
        ));

        // Add routes
        entryURL = oldReturnURL.split(path.sep).slice(0, -1).join(path.sep);
        router.get(entryURL, passport.authenticate('google'), function (req, res) {
        });

        router.get(google.returnURL, function _onLoginPost(req, res, next) {
            passport.authenticate('google', function(err, user, info) {
                 if (!user) {
                    return res.json(null);
                 }

                 req.logIn(user, function(err) {
                     if (err) {
                         return next(err);
                    }

                     res.json(user);
                 });
            })(req, res, next);
        });
    }

    router.post('/auth/signup', (req, res, next) => {
        let inputData = {};
        inputData.name = req.body.email;
        inputData.email = req.body.email;
        inputData.password = req.body.password;
        db.addAccount(inputData, function _onAccountAdded(err, newAccount) {
            if (err) {
                res.status(401).json(err);
            } else {
                req.logIn(newAccount, function(err) {
                    if (err) {
                        return res.status(401).json(err);
                    }

                    res.json({ _id: newAccount._id, email: newAccount.email, name: newAccount.name });
                });
            }
        });
    });

    router.get('/auth/load', (req, res) => {
        res.json(req.isAuthenticated() ? req.session.passport.user : null);
    });

    router.get('/auth/logout', (req, res) => {
        req.logout();
        res.json(null);
    });
};

module.exports = AuthRoutes;