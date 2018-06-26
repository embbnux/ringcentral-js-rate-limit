# Rate limit middleware for RingCentral JS Client

## Usage

### Install

```
npm install ringcentral --save
npm install ringcentral-client --save
npm install https://github.com/embbnux/ringcentral-js-rate-limit.git
```

### Use with RingCentral JS Client

```
import SDK from 'ringcentral';
import RingCentralClient from 'ringcentral-client';
import rateLimit from 'ringcentral-rate-limit';

const client = new RingCentralClient(rateLimit(new SDK(sdkConfig)))
```
