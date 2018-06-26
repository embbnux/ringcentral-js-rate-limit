# Rate limit middleware for RingCentral JS Client

## Usage

### Install

```
npm install ringcentral --save
npm install https://github.com/embbnux/ringcentral-js-client.git#feature/429 --save
npm install https://github.com/embbnux/ringcentral-js-rate-limit.git
```

### Use with RingCentral JS Client

```
import SDK from 'ringcentral';
import RingCentralClient from 'ringcentral-client';
import rateLimit from 'ringcentral-rate-limit';

const client = new RingCentralClient(rateLimit(new SDK(sdkConfig)))
```

### How it works

![image](https://user-images.githubusercontent.com/7036536/41897965-56550b62-795b-11e8-9eeb-8668594b691a.png)

Firstly we add all requests into waiting queue. When requesting list is free, request will be moved from waiting queue into requesting list. We use rate limit information from last response of server to decide if to move request into requesting list.
