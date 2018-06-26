import * as RingCentral from "ringcentral";
import * as uuid from 'uuid';

function rateLimit(sdk: RingCentral) {
  const platform = sdk.platform();
  const originalSend = platform.send.bind(platform);
  const rateLimitRemainings = {};
  const requestingStores = {};
  const waitingRequestQueues = {};
  const waitingQueueTimeouts = {};
  let newSendFunc;
  let handleRequestingStore;

  const getMaxConcurrencyCount = (apiGroup) : number => {
    const rateLimitRemaining = rateLimitRemainings[apiGroup];
    if (!rateLimitRemaining) {
      return 5;
    }
    const maxConcurrencyCount = Math.floor(rateLimitRemaining.limit / 3);
    if (maxConcurrencyCount < 1) {
      return 1;
    }
    return maxConcurrencyCount;
  };

  const dispatchRequest = (apiGroup, params, resolve, reject) => {
    if (!requestingStores[apiGroup]) {
      requestingStores[apiGroup] = {};
    }
    if (!waitingRequestQueues[apiGroup]) {
      waitingRequestQueues[apiGroup] = [];
    }
    if (waitingRequestQueues[apiGroup].length === 0) {
      const requestId = uuid.v4();
      const maxConcurrencyCount = getMaxConcurrencyCount(apiGroup);
      if (Object.keys(requestingStores[apiGroup]).length < maxConcurrencyCount) {
        requestingStores[apiGroup][requestId] = { params, resolve, reject, status: 'pending' };
        return;
      }
    }
    waitingRequestQueues[apiGroup].push({ params, resolve, reject, status: 'pending' });
  };

  const updateRateLimitRemaining = (apiGroup: string, headers: any) => {
    const newRemaining = {
      remaining: parseInt(headers.get('X-Rate-Limit-Remaining'), 10) / 2 * 0.5,
      timeWindow: parseInt(headers.get('X-Rate-Limit-Window'), 10),
      limit: parseInt(headers.get('X-Rate-Limit-Limit'), 10) / 2,
      timestamp: Date.now(),
    };
    const oldRemaining = rateLimitRemainings[apiGroup];
    if (
      !oldRemaining ||
      oldRemaining.remaining > newRemaining.remaining ||
      newRemaining.timestamp > oldRemaining.timestamp + 1000
    ) {
      rateLimitRemainings[apiGroup] = newRemaining;
    }
  };

  const moveWaitingRequestToRequestingStore = (apiGroup: string, force: boolean) => {
    const requestingStore = requestingStores[apiGroup];
    const maxConcurrencyCount = getMaxConcurrencyCount(apiGroup);
    if (Object.keys(requestingStore).length >= maxConcurrencyCount) {
      return;
    }
    if (waitingRequestQueues[apiGroup].length === 0) {
      return;
    }
    const rateLimitRemaining = rateLimitRemainings[apiGroup];
    if (
      !rateLimitRemaining ||
      rateLimitRemaining.remaining > Object.keys(requestingStore).length ||
      force
    ) {
      const waitingRequest = waitingRequestQueues[apiGroup].shift();
      const requestId = uuid.v4();
      requestingStore[requestId] = waitingRequest;
      return;
    }
    if (Object.keys(requestingStore).length === 0) {
      if (waitingQueueTimeouts[apiGroup]) {
        return;
      }
      waitingQueueTimeouts[apiGroup] = setTimeout(() => {
        waitingQueueTimeouts[apiGroup] = null;
        moveWaitingRequestToRequestingStore(apiGroup, true);
        handleRequestingStore(apiGroup);
      }, rateLimitRemaining.timeWindow * 1000);
    }
  };

  handleRequestingStore = (apiGroup: string) => {
    const requestingStore = requestingStores[apiGroup];
    if (Object.keys(requestingStore).length === 0) {
      moveWaitingRequestToRequestingStore(apiGroup, false);
    }
    Object.keys(requestingStore).forEach((requestId) => {
      const requesting = requestingStore[requestId];
      if (requesting.status !== 'pending') {
        return;
      }
      requesting.status = 'requesting';
      originalSend(requesting.params).then((response) => {
        updateRateLimitRemaining(apiGroup, response.response().headers);
        requesting.resolve(response);
      }).catch((e) => {
        requesting.reject(e);
      }).finally(() => {
        delete requestingStore[requestId];
        moveWaitingRequestToRequestingStore(apiGroup, false);
        handleRequestingStore(apiGroup);
      });
    });
  }

  newSendFunc = (params: any) => {
    return new Promise((resolve, reject) => {
      if (!params.throttlingGroup) {
        resolve(originalSend(params));
        return;
      }
      const apiGroup = params.throttlingGroup.toLowerCase();
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

export default rateLimit;
