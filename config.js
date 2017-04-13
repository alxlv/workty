'use strict';
/**
 * Created by Alex Levshin on 07/06/16.
 */
var _ = require('lodash');
var passportAuthConfig = require('./passport-auth.config');

var settings = {
   client: {
       protocol: 'http', host: '127.0.0.1', port: 3000,
       getConnectionString: function() {
           return this.protocol + '://' + this.host + ':' + this.port;
       },
       allowMethods: 'GET, POST, OPTIONS, PUT, PATCH, DELETE',
       allowHeaders: 'Origin, X-Requested-With, Content-Type, Accept',
       allowCredentials: true
   },
   supervisor: {
       protocol: 'ws', host: '127.0.0.1', port: 3000, name: 'supervisor', email: 'supervisor@localhost', password: 'YuiDoUk74', authTimeout: 1000, hearbeatTimeout: 10000,
       getAuthorizationBasic: function() {
           return 'Basic c3VwZXJ2aXNvckB3b3JrdHkuY29tOll1aURvVWs3NA==';
       },
       getConnectionString: function() {
           return this.protocol + '://' + this.host + ':' + this.port + '/' + this.name;
       },
       getName: function() {
           return this.name;
       },
       getEmail: function() {
           return this.email;
       },
       getPassword: function() {
           return this.password;
       }
   },
   graylog: {
       host: '192.168.2.1', port: '12201'
   },
   mongodb: {
       protocol: 'mongodb', host: '127.0.0.1', port: 27017, name: 'workty',
       getConnectionString: function(dbName) {
           return this.protocol + '://' + this.host + ':' + this.port + '/' + dbName ? dbName : this.name;
       }
   },
   redisstore: {
       host: '127.0.0.1', port: 6379, prefix: 'workty-sess:'
   },
   filesystem: {
       root: '/nfs/workty'
   },
   restapi: {
       protocol: 'https', host: '127.0.0.1', port: 9999, errorLinkUrl: 'https://127.0.0.1/workty/docs/errors/api', name: 'restify api server',
       throttleConfig: { burst: 10, rate: 1000000 },
       getConnectionString: function() {
           return this.protocol + '://' + this.host + ':' + this.port;
       },
       versions: [
           {
               major: 1,
               sub: ['2016.10.1']
           }
       ],
       getLatestVersion: function() {
           if (this.versions.length === 0) {
               return null;
           }

           var latestVersion = {};

           _.forEach(this.versions, function _onEachVersion(version) {
               if (latestVersion.major) {
                   if (latestVersion.major < version.major) {
                       latestVersion.major = version.major;
                   }
               } else {
                   latestVersion.major = version.major;
               }

               _.forEach(version.sub, function _onEachSubVersion(subVersion) {
                   var subVersionParts = subVersion.split('.');
                   var subVersionDate = new Date(subVersionParts[0], subVersionParts[1], subVersionParts[2]);

                   if (latestVersion.sub) {
                       var currentSubVersionParts = latestVersion.sub.split('.');
                       var currentSubVersionDate = new Date(currentSubVersionParts[0], currentSubVersionParts[1], currentSubVersionParts[2]);
                       if (currentSubVersionDate < subVersionDate) {
                           latestVersion.sub = subVersion;
                       }
                   } else {
                       latestVersion.sub = subVersion;
                   }
               });
           });

           return latestVersion;
       }
   },
   auth: {
       getProvider: function(providerName) {
           var existingProvider = null;

           _.forOwn(passportAuthConfig, function _onEachProvider(value, key) {
               if (providerName.toLowerCase() === key) {
                   existingProvider = value;
                   return false;
               }
           });

           return existingProvider;
       }
   }
};

module.exports = settings;