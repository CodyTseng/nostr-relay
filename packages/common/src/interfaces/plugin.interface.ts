import { ClientContext } from '../client-context';
import { Event } from './event.interface';
import { HandleMessageResult } from './handle-result.interface';
import { IncomingMessage } from './message.interface';

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

export type NostrRelayPlugin =
  | HandleMessagePlugin
  | BeforeHandleEventPlugin
  | BroadcastPlugin;

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
 * The plugin implement this interface will be called when an event is broadcasted.
 *
 * @example
 * ```ts
 * class RedisBroadcastPlugin implements BroadcastPlugin {
 *   async broadcast(ctx, event, next) {
 *     await redis.publish('events', JSON.stringify(event));
 *     return next();
 *   }
 * }
 * ```
 */
export interface BroadcastPlugin {
  /**
   * This method functions like Koa middleware and is called when an event is broadcasted.
   *
   * @param event The event to broadcast
   * @param next The next function to call the next plugin
   */
  broadcast(event: Event, next: () => Promise<void>): Promise<void>;
}
