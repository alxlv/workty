<img src="https://cdn.rawgit.com/AlexLevshin/workty-wiki/fea468ce/images/hero-image.png" width="900" height="400">

# What is Workty?
The first thoughts about the platform came to me when working with Raspberry PI, when I was researching the single-board computer (sbc) market it became clear to me that now it's possible to build cheap and powerful distributed networks based on them. During the implementation of the first release of the project the sbc market has grown significantly. Now Raspberry PI has quite a number of competitors of different prices, quality and capacity. Raspberry PI already provides ARM Cortex-A53 x64 with 4 cores and Moore's law along with the principle of parallelism allow looking to the future with even more optimism. The next reason was the experience with the Workflow Foundation from Microsoft, but in the process of working with the products of this company (no matter how awesome they are), you always come across the limitations of the .NET world and it's hard to get rid of the feeling of isolation in it. Unnecessarily because utilities like nodejs/mongodb become mature, then the choice of tools for implementation of cross-platform was obvious. And the last but not least reason was the presence of a wonderful library **[machina-js](http://machina-js.org)**, without it everything would be much more complicated.
<p>Workty is the platform for running asynchronous automation tasks (workties) implemented as finite state machines combined in workflows. It's implemented on NodeJS framework and can be used on any CPU architecture which supports it. The platform supports REST API based on Restify framework. All interactions between end-users/application and application/single board computers go over HTTPS/Secure WebSockets protocols.</p>

Read more information on project's **[Wiki](https://github.com/AlexLevshin/workty/wiki)** pages.

# Getting started
Before you begin, you need to complete the following steps.

* Database<br>

Use docker image:
``` 
docker pull alexlevshin/workty-mongodb-3.0.6-amd64
```
and read **[Database](https://github.com/AlexLevshin/workty/wiki/1.-Database)** section

* Supervisor server<br>

Use docker image:
```
docker pull alexlevshin/workty-supervisor-amd64
```
and read **[Supervisor server](https://github.com/AlexLevshin/workty/wiki/2.-Supervisor-server)** section

* Rest API server<br>

Use docker image:
```
docker pull alexlevshin/workty-restapi-amd64
```
and read **[Rest API server](https://github.com/AlexLevshin/workty/wiki/3.-Rest-API-server)** section

* Worker
Use docker image:
```
docker pull alexlevshin/workty-worker-arm7
```
and read **[Worker](https://github.com/AlexLevshin/workty/wiki/5.-Worker)** section

# Rest API examples
### Create and run simple workflow
First, we create a regular user account. You can read more about account types **[here](https://github.com/AlexLevshin/workty/wiki/4.-Permissions-(ACL))**:
```
curl -u 'admin@account.com':'adminpassword' -H 'Content-type: application/json' --data '{ "name": "myaccount", "email": "myemail@mail.com" }' -k -v https://127.0.0.1:9999/api/v1/accounts
```

Create new workflow for the user:
```
curl -u 'myaccount':'myemail@mail.com'  -H 'Content-type: application/json' --data  '{ "name": "myworkflow", "desc": "workflow" }' -k -v https://127.0.0.1:9999/api/v1/workflows
```

Get all the workties installed in the system and select any:
```
curl -k -v -u 'myaccount':'myemail@mail.com' https://127.0.0.1:9999/api/v1/workties?pretty=true&sort=created
```

For example the previous request returned workty with id **5465c70e7906b5bb7960f08f**. Let's add it into your workflow with id **545f95ee2f82bdb917ad6f81** at first position:
```
curl -u 'myaccount':'myemail@mail.com' -H 'Content-type: application/json' --data '{ "name": "newworktyinstance", "desc": "newworktydesc", "worktyId": "5465c70e7906b5bb7960f08f" }' -k -v https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f81/worktiesInstances?position_type=first
```

Now you are ready to run your first workflow:
```
curl -X PUT -u 'myaccount':'myemail@mail.com' -k https://127.0.0.1:9999/api/v1/workflows/545f95ee2f82bdb917ad6f81/running
```

You can find the full API documentation **[here](https://github.com/AlexLevshin/workty/wiki/3.-Rest-API-server#api-documentation)** .

# Websocket API examples
### Create and run simple workflow
Let's use Restify integrated json client for websocket interaction.
``` javascript
'use strict';
var RootFolder = process.env.ROOT_FOLDER;

if (!global.rootRequire) {
    global.rootRequire = function (name) {
        return require(RootFolder + '/' + name);
    };
}

var _ = require('lodash');
var restify = require('restify');
var expect = require('chai').expect;
var request = require('superagent');
var ApiPrefix = '/api/v1';
var io = require('socket.io-client');
var crypto = require('crypto');
var protocolClient = rootRequire('shared/protocols/v1/client-sv-accounts.module').OPERATIONS;
var config = rootRequire('config');
var SubVersion = config.restapi.getLatestVersion().sub; // YYYY.M.D

function _generateToken(account, salt) {
    var sha256 = crypto.createHash('sha256');

    sha256.update(account.id);
    sha256.update(account.name);
    sha256.update(salt);

    return sha256.digest('hex');
}

function _getAccount(dbAccount) {
    var account = {};

    account.id = dbAccount._id;
    account.name = dbAccount.email;
    account.host = config.client.getConnectionString() + '/' + account.id;
    var salt = dbAccount.password || dbAccount.oauthID;
    account.token = _generateToken(account, salt);

    return account;
}

// Init the test client to get account
var adminClient = restify.createJsonClient({
    version: SubVersion,
    url: config.restapi.getConnectionString(),
    headers: {
        'Authorization': config.supervisor.getAuthorizationBasic() // supervisor
    },
    rejectUnauthorized: false
});
```

Now create a regular user account:
``` javascript
var user = request.agent();
var account;
var socket;

adminClient.get(ApiPrefix + '/accounts', function (err, req, res, data) {
  if (err) {
    return done(err);
  }
  
  // Login
  user
       .post(config.client.getConnectionString() + '/')
       .send({email: config.supervisor.email, password: config.supervisor.password})
       .end(function (err, res) {
         if (err) {
           return done(err);
         }

         account = _getAccount(data[0]);

         // Connect via websocket
         var host = config.client.getConnectionString() + '/' + account.id + '_' + ContextName;
         socket = io.connect(host, {
           transports: ['websocket', 'polling', 'flashsocket'],
           'log level': 2,
           'polling duration': 10
         });

         socket.on('connect', function _onClientConnected() {
           console.log('connecting...');
           socket.emit('authentication', account);
         });

         socket.on('disconnect', function () {
           console.log('disconnected...');
         });
       });
});
        
socket.emit(protocolClient.ADD.name, {
  account: {
    oauthID: '',
    name: 'myaccount',
    email: 'myemail@email.com',
    password: 'myaccount_pwd',
    aclRoleNames: ['regular']
  }
});
```

Create new workflow for the user:
``` javascript
var workflows = [];

function _onWorkflowDataReceived(data) {
  workflows.push(data.workflow);
  socket.off(protocolClient.CHANGED, _onWorkflowDataReceived);
}

socket.on(protocolClient.CHANGED, _onWorkflowDataReceived);

socket.emit(protocolClient.ADD.name, {
  workflow: {
    name: 'myworkflow',
    desc: 'workflow',
    accountId: account.id
  }
});
```

Get all the workties installed in the system and select any:
``` javascript
var workties = [];
function _onWorktiesDataReceived(data) {
   workties = data;
   socket.off(protocolClient.CHANGED, _onWorktiesDataReceived);
}

socket.on(protocolClient.CHANGED, _onWorktiesDataReceived);
socket.emit(protocolClient.REFRESH_ALL.name, {});
```

For example the previous request returned workty with id **5465c70e7906b5bb7960f08f**. Let's add it into your workflow with id **545f95ee2f82bdb917ad6f81** at first position:
``` javascript
socket.emit(protocolClient.ADD_WORKTY_INSTANCE.name, {
  workflow: {
    id: workflows[0]._id, // 545f95ee2f82bdb917ad6f81
    worktyInstance: {desc: 'myworktyinstance'}
  }, 
  workty: {id: workties[0]._id} // 5465c70e7906b5bb7960f08f
});
```

Run your workflow:
``` javascript
socket.emit(protocolClient.RUN.name, {
  workflow: {
    id: workflows[0]._id // 545f95ee2f82bdb917ad6f81
  }
});
```

After all action you need to log out:
``` javascript
user.get(config.client.getConnectionString() + '/logout')
    .end(function (err, res) {
      if (err) {
        return done(err);
      }    

      // Close websocket
      if (socket && socket.connected) {
        console.log('disconnecting...');
        socket.disconnect();
      } else {
        // There will not be a connection unless you have done() in beforeEach, socket.on('connect'...)
        console.log('no connection to break...');
      }
});
```
