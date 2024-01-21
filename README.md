# nostr-relay

[![codecov](https://codecov.io/gh/CodyTseng/nostr-relay/graph/badge.svg?token=9YG4V34301)](https://codecov.io/gh/CodyTseng/nostr-relay)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay?ref=badge_shield)

> Easily build your customized Nostr Relay.

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

## Examples

- [nostr-relay-sqlite](https://github.com/CodyTseng/nostr-relay-sqlite)

## Donate

If you like this project, you can buy me a coffee :) ⚡️ codytseng@getalby.com ⚡️

## License

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay?ref=badge_large)
