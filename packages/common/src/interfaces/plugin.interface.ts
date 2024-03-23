import { ClientContext } from '../client-context';
import { Event } from './event.interface';
import { HandleMessageResult } from './handle-result.interface';
import { IncomingMessage } from './message.interface';

export type NostrRelayPlugin = HandleMessageMiddleware | BroadcastMiddleware;

export interface HandleMessageMiddleware {
  handleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
    next: () => Promise<HandleMessageResult>,
  ): Promise<HandleMessageResult> | HandleMessageResult;
}

export interface BroadcastMiddleware {
  broadcast(
    ctx: ClientContext,
    event: Event,
    next: () => Promise<void>,
  ): Promise<void> | void;
}
