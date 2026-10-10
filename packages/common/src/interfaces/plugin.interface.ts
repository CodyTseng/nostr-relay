import { ClientContext } from '../client-context';
import { Event, HandleEventResult } from './event.interface';
import { HandleMessageResult } from './handle-result.interface';
import { IncomingMessage } from './message.interface';
import { Observable } from 'rxjs';
import { EventQueryOptions } from './event-repository.interface';
import { Filter } from './filter.interface';

/** Plugins own their resources; initialization and cleanup are called once. */
export interface PluginLifecycle {
  init?(signal: AbortSignal): void | Promise<void>;
  destroy?(signal: AbortSignal): void | Promise<void>;
}

/**
 * The result of the `beforeHandleEvent` method.
 */
export type BeforeHandleEventResult = {
  /**
   * If the event should be handled. If the value is false, the event will be ignored.
   */
  canHandle: boolean;

  /**
   * The message to send to the client if the event is ignored.
   */
  message?: string;
};

export type NostrRelayPlugin = PluginLifecycle &
  (
    | PluginLifecycle
    | HandleMessagePlugin
    | BeforeHandleEventPlugin
    | CanReadEventPlugin
    | BroadcastPlugin
    | HandleEventPlugin
    | FindEventsPlugin
    | PublishEventPlugin
  );

/** Wrap validated event processing, e.g. for application-owned caching. */
export interface HandleEventPlugin {
  handleEvent(
    event: Event,
    next: () => Promise<HandleEventResult>,
  ): Promise<HandleEventResult>;
}

/** Wrap raw repository queries; client read guards always run afterwards. */
export interface FindEventsPlugin {
  findEvents(
    filter: Filter,
    options: EventQueryOptions,
    next: () => Observable<Event>,
  ): Observable<Event>;
}

/** Once per newly accepted event, before per-client delivery. */
export interface PublishEventPlugin {
  publishEvent(event: Event, next: () => Promise<void>): Promise<void>;
}

/**
 * The plugin implement this interface will be called when a new message is received from a client.
 *
 * @example
 * ```ts
 * class MessageLoggerPlugin implements HandleMessagePlugin {
 *   async handleMessage(ctx, message, next) {
 *     const startTime = Date.now();
 *     console.log('Received message:', message);
 *     const result = await next();
 *     console.log('Message processed in', Date.now() - startTime, 'ms');
 *     return result;
 *   }
 * }
 * ```
 */
export interface HandleMessagePlugin {
  /**
   * This method functions like Koa middleware and is called when a new message is received from a client.
   *
   * @param ctx The client context
   * @param message The incoming message
   * @param next The next function to call the next plugin
   */
  handleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
    next: () => Promise<HandleMessageResult>,
  ): Promise<HandleMessageResult>;
}

/**
 * The plugin implement this interface will be called before handling an event.
 * You can use this interface to implement a guard for events.
 *
 * @example
 * ```ts
 * class BlacklistGuardPlugin implements BeforeHandleEventPlugin {
 *   private blacklist = [
 *     // ...
 *   ];
 *
 *   beforeHandleEvent(event) {
 *     const canHandle = !this.blacklist.includes(event.pubkey);
 *     return {
 *       canHandle,
 *       message: canHandle ? undefined : 'block: you are blacklisted',
 *     };
 *   }
 * }
 * ```
 */
export interface BeforeHandleEventPlugin {
  /**
   * This method will be called before handling an event.
   *
   * @param event The event will be handled
   */
  beforeHandleEvent(
    event: Event,
  ): Promise<BeforeHandleEventResult> | BeforeHandleEventResult;
}

/**
 * The plugin is called once for each client with subscriptions matching a broadcast event.
 * Call next() to deliver the event to that client's matching subscriptions.
 *
 * @example
 * ```ts
 * class BroadcastGuardPlugin implements BroadcastPlugin {
 *   async broadcast(ctx, event, next) {
 *     if (!ctx.pubkey) return;
 *     return next();
 *   }
 * }
 * ```
 */
export interface BroadcastPlugin {
  /**
   * This method functions like Koa middleware and controls delivery to one client.
   *
   * @param ctx The receiving client's context
   * @param event The event to broadcast
   * @param next The next function to call the next plugin
   */
  broadcast(
    ctx: ClientContext,
    event: Event,
    next: () => Promise<void>,
  ): Promise<void>;
}

/** Controls event visibility for both historical REQ results and live delivery. */
export interface CanReadEventPlugin {
  /**
   * Return false to hide the event from this client. All registered read guards
   * must allow access. A thrown error prevents delivery as well.
   *
   * @param ctx The receiving client's context
   * @param event The event to read
   */
  canReadEvent(
    ctx: ClientContext,
    event: Event,
    signal?: AbortSignal,
  ): boolean | Promise<boolean>;
}
