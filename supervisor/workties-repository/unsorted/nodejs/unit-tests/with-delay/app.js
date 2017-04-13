/**
 * Created by Alex Levshin on 17/3/16.
 */
const NODE_MODULES_PATH = './node_modules/';

const _ = require(NODE_MODULES_PATH + 'lodash');
const parseArgs = require(NODE_MODULES_PATH + 'minimist');
const argv = parseArgs(process.argv.slice(2));
const util = require('util');

setTimeout(() => {
    console.log('I am with-delay compressed workty');
    console.log(util.inspect(argv));
}, 1000);