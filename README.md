<img src="https://cdn.rawgit.com/AlexLevshin/workty-wiki/fea468ce/images/hero-image.png" width="900" height="400">

# What is Workty?
The first thoughts about the platform came to me when working with Raspberry PI, when I was researching the single-board computer (sbc) market it became clear to me that now it's possible to build cheap and powerful distributed networks based on them. During the implementation of the first release of the project the sbc market has grown significantly. Now Raspberry PI has quite a number of competitors of different prices, quality and capacity. Raspberry PI already provides ARM Cortex-A53 x64 with 4 cores and Moore's law along with the principle of parallelism allow looking to the future with even more optimism. The next reason was the experience with the Workflow Foundation from Microsoft, but in the process of working with the products of this company (no matter how awesome they are), you always come across the limitations of the .NET world and it's hard to get rid of the feeling of isolation in it. Unnecessarily because utilities like nodejs/mongodb become mature, then the choice of tools for implementation of cross-platform was obvious. And the last but not least reason was the presence of a wonderful library **[machina-js](http://machina-js.org)**, without it everything would be much more complicated.
<p>Workty is the platform for running asynchronous automation tasks (workties) implemented as finite state machines combined in workflows. It's implemented on NodeJS framework and can be used on any CPU architecture which supports it. The platform supports REST API based on Restify framework. All interactions between end-users/application and application/single board computers go over HTTPS/Secure WebSockets protocols.</p>

Read more information on project's **[Wiki](https://github.com/AlexLevshin/workty/wiki)** pages.

# Getting started
Before you begin, you need to complete the following steps:
1. **[Install database](https://github.com/AlexLevshin/workty/wiki/1.-Database)**
2. **[Install Supervisor server](https://github.com/AlexLevshin/workty/wiki/2.-Supervisor-server)**<br>
  2.1. **[Install workies repository into database](https://github.com/AlexLevshin/workty/wiki/2.-Supervisor-server#workties-repository)**
3. **[Install Rest API server](https://github.com/AlexLevshin/workty/wiki/3.-Rest-API-server)**
4. **[Install workers](https://github.com/AlexLevshin/workty/wiki/5.-Worker)**

# Rest API examples
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
