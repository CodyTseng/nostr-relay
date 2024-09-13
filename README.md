# nostr-relay

[![codecov](https://codecov.io/gh/CodyTseng/nostr-relay/graph/badge.svg?token=9YG4V34301)](https://codecov.io/gh/CodyTseng/nostr-relay)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay?ref=badge_shield)

> Easily build your customized Nostr Relay.

## Used By

- [nostr-relay-nestjs](https://github.com/CodyTseng/nostr-relay-nestjs)
- [nostr-relay-tray](https://github.com/CodyTseng/nostr-relay-tray)
- [nostr-relay-sqlite](https://github.com/CodyTseng/nostr-relay-sqlite)

## Usage

I think examples are the best way to explain how to use this library.

```typescript
import { NostrRelay, createOutgoingNoticeMessage } from '@nostr-relay/core';
import { EventRepositorySqlite } from '@nostr-relay/event-repository-sqlite';
import { Validator } from '@nostr-relay/validator';
import { WebSocketServer } from 'ws';

async function bootstrap() {
  const wss = new WebSocketServer({ port: 4869 });

  // You can implement your own event repository. It just needs to implement a few methods.
  const eventRepository = new EventRepositorySqlite();
  const relay = new NostrRelay(eventRepository);
  const validator = new Validator();

  wss.on('connection', ws => {
    // Handle a new client connection. This method should be called when a new client connects to the Nostr Relay server.
    relay.handleConnection(ws);

    ws.on('message', async data => {
      try {
        // Validate the incoming message.
        const message = await validator.validateIncomingMessage(data);
        // Handle the incoming message.
        await relay.handleMessage(ws, message);
      } catch (error) {
        if (error instanceof Error) {
          ws.send(JSON.stringify(createOutgoingNoticeMessage(error.message)));
        }
      }
    });

    // Handle a client disconnection. This method should be called when a client disconnects from the Nostr Relay server.
    ws.on('close', () => relay.handleDisconnect(ws));

    ws.on('error', error => {
      ws.send(JSON.stringify(createOutgoingNoticeMessage(error.message)));
    });
  });
}
bootstrap();
```

Full API documentation can be found [here](https://codytseng.github.io/nostr-relay/)

## Plugin

[Official plugins](https://github.com/CodyTseng/nostr-relay-plugin)

You can create your own plugin to extend the functionality of the Nostr Relay. A plugin is just an object containing some of the following methods:

### handleMessage

This method functions like Koa middleware and is called when a new message is received from a client.

Params:

- `ctx`: The context object of the client.
- `message`: The incoming message.
- `next`: The next function to call the next plugin.

Example:

```typescript
import { HandleMessagePlugin } from '@nostr-relay/common';

class MessageLoggerPlugin implements HandleMessagePlugin {
  async handleMessage(ctx, message, next) {
    const startTime = Date.now();
    console.log('Received message:', message);
    const result = await next();
    console.log('Message processed in', Date.now() - startTime, 'ms');
    return result;
  }
}

relay.register(new MessageLoggerPlugin());
```

### beforeHandleEvent

This method will be called before handling an event. If the method returns false, the event will be ignored.

params:

- `event`: The incoming event.

Example:

```typescript
import { HandleMessagePlugin } from '@nostr-relay/common';

class BlacklistGuardPlugin implements BeforeHandleEventPlugin {
  private blacklist = [
    // ...
  ];

  beforeHandleEvent(event) {
    const canHandle = !this.blacklist.includes(event.pubkey);
    return {
      canHandle,
      message: canHandle ? undefined : 'block: you are blacklisted',
    };
  }
}

relay.register(new BlacklistGuardPlugin());
```

### broadcast

This method functions like Koa middleware and is called when an event is broadcast.

Params:

- `event`: The event to broadcast.
- `next`: The next function to call the next plugin.

Example:

```typescript
import { BroadcastPlugin } from '@nostr-relay/common';

class RedisBroadcastPlugin implements BroadcastPlugin {
  async broadcast(event, next) {
    await redis.publish('events', JSON.stringify(event));
    return next();
  }
}

relay.register(new RedisBroadcastPlugin());
```

### More to come...

## Donate

If you like this project, you can buy me a coffee :) ⚡️ codytseng@getalby.com ⚡️

## License

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay?ref=badge_large)
