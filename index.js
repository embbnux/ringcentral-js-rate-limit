"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var uuid = require("uuid");
function rateLimit(sdk) {
    var platform = sdk.platform();
    var originalSend = platform.send.bind(platform);
    var rateLimitRemainings = {};
    var requestingStores = {};
    var waitingRequestQueues = {};
    var waitingQueueTimeouts = {};
    var newSendFunc;
    var handleRequestingStore;
    var getMaxConcurrencyCount = function (apiGroup) {
        var rateLimitRemaining = rateLimitRemainings[apiGroup];
        if (!rateLimitRemaining) {
            return 5;
        }
        var maxConcurrencyCount = Math.floor(rateLimitRemaining.limit / 4);
        if (maxConcurrencyCount < 1) {
            return 1;
        }
        return maxConcurrencyCount;
    };
    var dispatchRequest = function (apiGroup, params, resolve, reject) {
        if (!requestingStores[apiGroup]) {
            requestingStores[apiGroup] = {};
        }
        if (!waitingRequestQueues[apiGroup]) {
            waitingRequestQueues[apiGroup] = [];
        }
        if (waitingRequestQueues[apiGroup].length === 0) {
            var requestId = uuid.v4();
            var maxConcurrencyCount = getMaxConcurrencyCount(apiGroup);
            if (Object.keys(requestingStores[apiGroup]).length < maxConcurrencyCount) {
                requestingStores[apiGroup][requestId] = { params: params, resolve: resolve, reject: reject, status: 'pending' };
                return;
            }
        }
        waitingRequestQueues[apiGroup].push({ params: params, resolve: resolve, reject: reject, status: 'pending' });
    };
    var updateRateLimitRemaining = function (apiGroup, headers) {
        var newRemaining = {
            remaining: parseInt(headers.get('X-Rate-Limit-Remaining'), 10),
            timeWindow: parseInt(headers.get('X-Rate-Limit-Window'), 10),
            limit: parseInt(headers.get('X-Rate-Limit-Limit'), 10),
            timestamp: Date.now(),
        };
        var oldRemaining = rateLimitRemainings[apiGroup];
        if (!oldRemaining ||
            oldRemaining.remaining > newRemaining.remaining ||
            newRemaining.timestamp > oldRemaining.timestamp + 1000) {
            rateLimitRemainings[apiGroup] = newRemaining;
        }
    };
    var moveWaitingRequestToRequestingStore = function (apiGroup, force) {
        var requestingStore = requestingStores[apiGroup];
        var maxConcurrencyCount = getMaxConcurrencyCount(apiGroup);
        if (Object.keys(requestingStore).length >= maxConcurrencyCount) {
            return;
        }
        if (waitingRequestQueues[apiGroup].length === 0) {
            return;
        }
        var rateLimitRemaining = rateLimitRemainings[apiGroup];
        if (!rateLimitRemaining ||
            rateLimitRemaining.remaining > Object.keys(requestingStore).length + 1 ||
            Date.now() > (rateLimitRemaining.timstamp + (60 * 1000)) ||
            force) {
            var waitingRequest = waitingRequestQueues[apiGroup].shift();
            var requestId = uuid.v4();
            requestingStore[requestId] = waitingRequest;
            return;
        }
        if (Object.keys(requestingStore).length === 0) {
            if (waitingQueueTimeouts[apiGroup]) {
                return;
            }
            waitingQueueTimeouts[apiGroup] = setTimeout(function () {
                waitingQueueTimeouts[apiGroup] = null;
                moveWaitingRequestToRequestingStore(apiGroup, true);
                handleRequestingStore(apiGroup);
            }, rateLimitRemaining.timeWindow * 1000);
        }
    };
    handleRequestingStore = function (apiGroup) {
        var requestingStore = requestingStores[apiGroup];
        if (Object.keys(requestingStore).length === 0) {
            moveWaitingRequestToRequestingStore(apiGroup, false);
        }
        Object.keys(requestingStore).forEach(function (requestId) {
            var requesting = requestingStore[requestId];
            if (requesting.status !== 'pending') {
                return;
            }
            requesting.status = 'requesting';
            originalSend(requesting.params).then(function (response) {
                updateRateLimitRemaining(apiGroup, response.response().headers);
                requesting.resolve(response);
            }).catch(function (e) {
                requesting.reject(e);
            }).finally(function () {
                delete requestingStore[requestId];
                moveWaitingRequestToRequestingStore(apiGroup, false);
                handleRequestingStore(apiGroup);
            });
        });
    };
    newSendFunc = function (params) {
        return new Promise(function (resolve, reject) {
            if (!params.throttlingGroup) {
                resolve(originalSend(params));
                return;
            }
            var apiGroup = params.throttlingGroup.toLowerCase();
            dispatchRequest(apiGroup, params, resolve, reject);
            handleRequestingStore(apiGroup);
            // console.log({
            //   apiGroup,
            //   store: Object.keys(requestingStores[apiGroup]),
            //   waitingRequestQueues: waitingRequestQueues[apiGroup],
            //   max: getMaxConcurrencyCount(apiGroup)
            // });
        });
    };
    // repleace send func in RC SDK
    platform.send = newSendFunc;
    return sdk;
}
exports.default = rateLimit;
//# sourceMappingURL=index.js.map