import { ClientContext } from '../client-context';
import { Event } from './event.interface';
import { HandleMessageResult } from './handle-result.interface';
import { IncomingMessage } from './message.interface';

export type NostrRelayPlugin = HandleMessagePlugin | BroadcastPlugin;

/**
 * A plugin that will be called when a new message is received from a client.
 *
 * @example
 * ```ts
 * // message logger plugin
 * class MessageLoggerPlugin implements HandleMessagePlugin {
 *   async handleMessage(ctx, message, next) {
 *     const startTime = Date.now();
 *     console.log('Received message:', message);
 *     const result = await next();
 *     console.log('Message processed in', Date.now() - startTime, 'ms');
 *     return result;
 *   }
 * }
 *
 * // blacklist plugin
 * class BlacklistPlugin implements HandleMessagePlugin {
 *   blacklist = [
 *     // ...
 *   ];
 *
 *   async handleMessage(ctx, message, next) {
 *     if (message[0] === 'EVENT' && blacklist.includes(message[1].pubkey)) {
 *       return;
 *     }
 *     return next();
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
 * A plugin that will be called when an event is broadcasted.
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
   * @param ctx The client context
   * @param event The event to broadcast
   * @param next The next function to call the next plugin
   */
  broadcast(
    ctx: ClientContext,
    event: Event,
    next: () => Promise<void>,
  ): Promise<void>;
}
