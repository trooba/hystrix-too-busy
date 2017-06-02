'use strict';

const Assert = require('assert');
const Async = require('async');
const Toobusy = require('..');
const originalTobusy = Toobusy.deps.toobusy;

describe(__filename, () => {
    before(() => {
        Assert.equal(true, Toobusy.started());
        originalTobusy.shutdown();
        Assert.equal(false, Toobusy.started());
    });

    beforeEach(() => {
        Toobusy.init();
    });

    it('should create command', () => {
        Toobusy.deps.toobusy = () => true;
        Assert.ok(Toobusy.command);
    });

    it('should indicate free, toobusy:false', next => {
        Toobusy.deps.toobusy = () => false;
        Toobusy.getStatus(busy => setImmediate(() => {
            Assert.equal(false, busy);
            next();
        }));
    });

    it('should indicate free, toobusy:true, but before threshold', next => {
        Toobusy.deps.toobusy = () => true;
        Toobusy.getStatus(busy => setImmediate(() => {
            Assert.equal(false, busy);
            next();
        }));
    });

    it('should indicate busy, toobusy:true, beyond threshold', next => {
        Toobusy.deps.toobusy = () => true;
        Toobusy.init({
            default: {
                circuitBreakerRequestVolumeThreshold: 1
            }
        });
        Toobusy.getStatus(busy => setImmediate(() => {
            Assert.equal(false, busy);

            Toobusy.getStatus(busy => setImmediate(() => {
                Assert.equal(true, busy);

                Toobusy.getStatus(busy => setImmediate(() => {
                    Assert.equal(true, busy);
                    next();
                }));
            }));
        }));
    });

    it('should indicate busy and become free after sleep window passes', next => {
        Toobusy.deps.toobusy = () => true;
        Toobusy.init({
            default: {
                circuitBreakerRequestVolumeThreshold: 1,
                circuitBreakerSleepWindowInMilliseconds: 20 //ms
            }
        });

        Async.series([
            next => Toobusy.getStatus(busy => setImmediate(() => {
                Assert.equal(false, busy);
                next();
            })),

            next => Toobusy.getStatus(busy => setImmediate(() => {
                Assert.equal(true, busy);
                next();
            })),

            next => {
                Toobusy.deps.toobusy = () => false;
                next();
            },

            next => Toobusy.getStatus(busy => setImmediate(() => {
                // still should be busy
                Assert.equal(true, busy);
                next();
            })),

            next => setTimeout(next, 100), // wait for the next sleep window

            next => Toobusy.getStatus(busy => setImmediate(() => {
                // still should be busy
                Assert.equal(false, busy);
                next();
            })),
        ], next);
    });

    it('should use real toobusy', next => {
        Toobusy.deps.toobusy = originalTobusy;
        Assert.equal(false, Toobusy.started());
        Toobusy.init({
            interval: 1000,
            latencyThreshold: 120,
            smoothingFactor: 0.4
        });
        Assert.equal(true, Toobusy.started());
        next();
    });

    it('should pick up config specific to command', next => {
        Toobusy.deps.toobusy = () => true;
        Toobusy.init({
            default: {
                // this will effectivly disable circuit breaker for the first 10 requests
                circuitBreakerRequestVolumeThreshold: 10
            },
            commands: {
                foo: {
                    // this will effectivly enable circuit breaker starting from the first request
                    circuitBreakerRequestVolumeThreshold: 1
                }
            }
        });
        Toobusy.getStatus('foo', busy => setImmediate(() => {
            Assert.equal(false, busy);

            Toobusy.getStatus('foo', busy => setImmediate(() => {
                Assert.equal(true, busy);

                Toobusy.getStatus('foo', busy => setImmediate(() => {
                    Assert.equal(true, busy);
                    next();
                }));
            }));
        }));
    });
});
