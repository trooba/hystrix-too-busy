'use strict';

const Hystrix = require('hystrixjs');

const commandFactory = Hystrix.commandFactory;
const circuitFactory = Hystrix.circuitFactory;
const metricsFactory = Hystrix.metricsFactory;

const GROUP = 'TooBusyGroup';
const PREFIX = 'too-busy-';

const toobusy = require('toobusy-js');
Object.assign(module.exports, toobusy);

const DEFAULT_CONFIG = {
    circuitBreakerErrorThresholdPercentage: 50, // optional
    circuitBreakerForceClosed: false, // optional
    circuitBreakerForceOpened: false, // optional
    circuitBreakerRequestVolumeThreshold: 20, // optional
    circuitBreakerSleepWindowInMilliseconds: 5000, // optional
    requestVolumeRejectionThreshold: 0, // optional
    statisticalWindowNumberOfBuckets: 10, // optional
    statisticalWindowLength: 10000, // optional
    percentileWindowNumberOfBuckets: 6, // optional
    percentileWindowLength: 60000 // optional
};

let tooBusyConfig = {
    default: DEFAULT_CONFIG
};

/*
  Too busy module lacks a floating window of observations over time which leads to false positives for
  too busy signal.
  By using hystrix we get a flowting monitor window which should eliminate false positives.
  The tresholds are controlled by hsyrtix command configuration.
  Now it will emit tooBusy only when the system accumulated many of them
*/
module.exports.getStatus = function getStatus(name, callback) {
    if (arguments.length === 1) {
        callback = name;
        name = undefined;
    }

    getCommand(name)
    .execute()
    .then(() => callback(false))
    .catch(err => {
        if (err.message === 'OpenCircuitError') {
            return callback(true);
        }
        // otherwise we are all good and supress too busy error
        callback(false);
    });
};

function getCommand(name) {
    const commandName = PREFIX + (name || 'hystrix-command');
    const builder = commandFactory
    .getOrCreate(commandName, GROUP);

    const commandConfig = tooBusyConfig.commands && tooBusyConfig.commands[name];
    builder.config = commandConfig ||
        tooBusyConfig.default;

    builder.run(function run() {
        return new Promise((resolve, reject) => {
            if (module.exports.deps.toobusy()) {
                return reject(new Error('TooBusy'));
            }
            resolve();
        });
    });

    return builder.build();
}

// expose for easy testing
module.exports.deps = {
    Hystrix: Hystrix,
    toobusy: toobusy
};

Object.defineProperty(module.exports, 'command', {
    get: function () {
        return getCommand();
    }
});

module.exports.init = function init(config) {
    commandFactory.resetCache();
    circuitFactory.resetCache();
    metricsFactory.resetCache();

    config = config || {};

    if (config.default) {
        tooBusyConfig.default = Object.assign(tooBusyConfig.default,
            config.default);
    }

    if (config.commands) {
        tooBusyConfig.commands = tooBusyConfig.commands || {};
        Object.keys(config.commands).forEach(name => {
            tooBusyConfig.commands[name] =
                Object.assign({}, tooBusyConfig.default,
                    config.commands[name]);
        });
    }

    if (config.latencyThreshold) {
        module.exports.maxLag(config.latencyThreshold);
    }
    if (config.interval) {
        module.exports.interval(config.interval);
    }
    if (config.smoothingFactor) {
        module.exports.smoothingFactor(config.smoothingFactor);
    }
};
