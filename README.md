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
  await eventRepository.init();
  const relay = new NostrRelay(eventRepository);
  const validator = new Validator();
  // Register plugins before initializing the relay. Repository initialization remains explicit.
  await relay.init();

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

Read access policies are implemented by plugins. NIP-42 authenticates clients but does not restrict direct message queries, counts, or delivery. Use `HandleMessagePlugin` to guard incoming REQ and COUNT requests, and `CanReadEventPlugin` to control event visibility in both historical REQ results and live delivery. Without a guard plugin, matching events are served regardless of kind or authentication. `EventUtils.checkPermission` has been removed.

### canReadEvent

`CanReadEventPlugin` checks each event against the receiving client's context before it is returned or sent. The hook accepts a synchronous boolean or a promise. All registered read guards must allow access; evaluation stops at the first denial. With no read guards registered, events are readable by default.

```typescript
import { CanReadEventPlugin, ClientContext, Event } from '@nostr-relay/common';

class AuthenticatedReadPlugin implements CanReadEventPlugin {
  canReadEvent(ctx: ClientContext, event: Event) {
    return !!ctx.pubkey;
  }
}

relay.register(new AuthenticatedReadPlugin());
```

Denied historical events are omitted from both EVENT messages and the returned result; EOSE is sent after all read checks complete. A read guard error closes the historical request. During live delivery, a read guard error blocks that client's delivery and is logged; other clients can still receive the event.

`findEvents(filters, ctx, iteratee)` also applies read guards when a `ClientContext` is supplied. Its second parameter now accepts a context instead of a public key. Calls without a context are trusted server-side queries that bypass read guards. `countEvents()` is likewise a trusted server-side API and does not apply per-event read guards. Client COUNT access must be restricted or its filters narrowed in `HandleMessagePlugin` according to the read policy. Calling `next()` and filtering the returned message result is too late to prevent events or counts from being sent.

### broadcast

This method functions like Koa middleware and is called once for each client with subscriptions matching a broadcast event. It applies both to newly handled events and direct `relay.broadcast()` calls. Call `next()` to run read guards and deliver allowed events to that client's matching subscriptions; omit it to block delivery. Existing broadcast plugins must update their signature to `(ctx, event, next)` and account for execution per client rather than per event.

Params:

- `ctx`: The receiving client's context, including its authenticated public key.
- `event`: The event to broadcast.
- `next`: The next function to call the next plugin.

Example:

```typescript
import { BroadcastPlugin } from '@nostr-relay/common';

class BroadcastGuardPlugin implements BroadcastPlugin {
  async broadcast(ctx, event, next) {
    if (!ctx.pubkey) return;
    return next();
  }
}

relay.register(new BroadcastGuardPlugin());
```

### Event processing, queries, and publication

The framework does not cache event processing results or query results. Cache lifetime, size, invalidation, concurrent requests, and failed-result handling belong to application plugins.

- `HandleEventPlugin.handleEvent(event, next)` wraps event processing after validation and `beforeHandleEvent` guards. A caching plugin should only cache results for verified events and define how failures and policy changes invalidate them.
- `FindEventsPlugin.findEvents(filter, options, next)` wraps a raw repository query and returns an `Observable<Event>`. Filters are normalized before this hook; read guards run after it, including when the plugin returns cached events. The plugin must respect `options.signal` and manage the cancellation semantics of shared queries.
- `PublishEventPlugin.publishEvent(event, next)` runs once for a newly accepted event. This is the hook for forwarding accepted events to Redis or another relay. Calling `next()` continues local delivery. Direct `relay.broadcast(event)` only performs local delivery, so externally received events can be delivered without publishing them again.

### Subscription lifecycle

`ctx.subscriptions` is a `Map<string, ClientSubscription>`. Each subscription has its own normalized `filters`, cancellation `signal`, and state: `querying`, `draining`, `live`, or `closed`. Reusing an ID creates a new subscription instance and cancels the previous one.

A subscription is registered before historical queries begin. Matching live events received during history are buffered; historical EVENT messages are followed by EOSE, then buffered live events are drained with fresh read checks. Events already delivered during history are deduplicated during this transition. CLOSE, replacement, disconnect, and destruction cancel pending queries and prevent an old generation from delivering messages to its replacement.

When a new subscription ID reaches `maxSubscriptionsPerClient`, the oldest active subscription is cancelled and receives CLOSED before the new subscription is admitted. Replacing an existing ID does not evict another subscription or emit CLOSED; the replacement starts a new generation and moves to the end of the age order. Catch-up buffer overflow and query timeout close only the affected subscription. Transport sockets remain owned by the application.

### Filter semantics

`FilterUtils.normalize()` is shared by validators, the framework, and the SQLite adapter. It clones filters, deduplicates array values, removes undefined fields, and trims search strings.

- Empty `ids`, `authors`, `kinds`, or `#tag` arrays match no events. Empty `&tag` arrays impose no requirements.
- Values within `#tag` are OR conditions; all values within `&tag` are required. Different fields are combined with AND. The existing rule excluding AND values from the same tag's OR values is preserved.
- `since` and `until` are inclusive, including zero. A reversed time range matches no events.
- `limit` applies to historical queries; COUNT ignores it and realtime delivery does not use it.
- Nonempty `search` remains historical-only; whitespace-only search is treated as absent. Unsupported search queries return no results.

SQLite applies every tag condition, including three or more names, and limits distinct events. A filter contract test checks that SQLite queries, COUNT, and live matching agree for filters supported by all three paths.

### Resource ownership and plugin lifecycle

Register all plugins before `await relay.init()`. Initialization also runs lazily before asynchronous relay operations. A plugin can provide `init(signal)` and `destroy(signal)` to own connections, caches, timers, and other resources. Initialization runs in registration order; cleanup runs in reverse order, once per plugin. Initialization failures roll back plugin resources. Cleanup continues after individual failures and reports collected errors.

`relay.destroy()` is idempotent. It cancels client and trusted query work, waits for admitted operations, destroys plugins, and closes the repository by default. Set `destroyRepository: false` when a repository is shared or its lifetime belongs to the application. Calls after destruction are rejected. Adapters receive optional query cancellation signals and should cancel underlying I/O when supported; unsubscribing or timing out cannot forcibly terminate third-party code that ignores cancellation.

| Option | Default | Behavior |
| --- | --- | --- |
| `maxSubscriptionsPerClient` | 20 | Close the oldest subscription and notify it before admitting a new ID |
| `maxFiltersPerRequest` | 20 | Bound filters in client REQ and COUNT |
| `maxPendingEventsPerSubscription` | 1000 | Bound unique live events buffered during history |
| `queryTimeoutMs` | 30000 | Deadline for historical querying and catch-up |
| `pluginLifecycleTimeoutMs` | 10000 | Deadline per plugin initialization or cleanup |
| `destroyRepository` | true | Close the repository when destroying the relay |

Set the validator's `maxFiltersPerRequest` consistently with the relay when changing this limit.

Migration notes: `filterResultCacheTtl` and `eventHandlingResultCacheTtl` and the internal `LazyCache` utility are removed. Subscription map values are subscription objects; access their `.filters` rather than treating the value as a filter array. `EventRepository.find()` and `count()` accept optional query options with a signal. `countEvents(filters, options)` replaces the unused public-key parameter. Store caches in plugins and release them in `destroy()`.


## Donate

If you like this project, you can buy me a coffee :) ⚡️ codytseng@getalby.com ⚡️

## License

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FCodyTseng%2Fnostr-relay?ref=badge_large)
