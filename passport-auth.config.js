/**
 * Created by Alex Levshin on 20/8/16.
 */
var ids = {
    local: {
        usernameField: 'email',
        passwordField: 'password'
    },
    facebook: {
        clientID: '1234567890',
        clientSecret: '',
        callbackURL: '/auth/provider/facebook/callback'
    },
    google: {
        clientID: '1234567890',
        clientSecret: '',
        returnURL: '/auth/provider/google/callback',
        stateless: true
    }
};

module.exports = ids;
