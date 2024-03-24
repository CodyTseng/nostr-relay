import { ClientContext } from '../client-context';
import { Event } from './event.interface';
import { HandleMessageResult } from './handle-result.interface';
import { IncomingMessage } from './message.interface';

export type NostrRelayPlugin = HandleMessagePlugin | BroadcastPlugin;

/**
 * A plugin that will be called when a new message is received from a client.
 */
export interface HandleMessagePlugin {
  /**
   * This method functions like Koa middleware and is called when a new message is received from a client.
   *
   * @param ctx The client context
   * @param message The incoming message
   * @param next The next function to call the next plugin
   * @returns The result of the message handling
   *
   * @example
   * ```ts
   * // message logger plugin
   * async handleMessage(ctx, message, next) {
   *   const startTime = Date.now();
   *   console.log('Received message:', message);
   *   const result = await next();
   *   console.log('Message processed in', Date.now() - startTime, 'ms');
   *   return result;
   * }
   *
   * // blacklist plugin
   * const blacklist = [
   *  // ...
   * ];
   * async handleMessage(ctx, message, next) {
   *   if (message[0] === 'EVENT' && blacklist.includes(message[1].pubkey)) {
   *     return;
   *   }
   *   return next();
   * }
   * ```
   */
  handleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
    next: () => Promise<HandleMessageResult>,
  ): Promise<HandleMessageResult> | HandleMessageResult;
}

/**
 * A plugin that will be called when an event is broadcasted.
 */
export interface BroadcastPlugin {
  /**
   * This method functions like Koa middleware and is called when an event is broadcasted.
   *
   * @param ctx The client context
   * @param event The event to broadcast
   * @param next The next function to call the next plugin
   * @returns void
   *
   * @example
   * ```ts
   * // redis broadcast plugin
   * async broadcast(ctx, event, next) {
   *   await redis.publish('events', JSON.stringify(event));
   *   return next();
   * }
   * ```
   */
  broadcast(
    ctx: ClientContext,
    event: Event,
    next: () => Promise<void>,
  ): Promise<void> | void;
}
