import { ClientContext } from '../client-context';
import { Event, EventHandleResult } from './event.interface';
import { HandleMessageResult } from './handle-result.interface';
import { IncomingMessage } from './message.interface';

export type NostrRelayPlugin =
  | PreHandleMessage
  | PostHandleMessage
  | PreHandleEvent
  | PostHandleEvent
  | PreBroadcast
  | PostBroadcast;

export interface PreHandleMessage {
  preHandleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
  ): Promise<IncomingMessage | null> | IncomingMessage | null;
}

export interface PostHandleMessage {
  postHandleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
    handleResult: HandleMessageResult,
  ): Promise<void> | void;
}

export interface PreHandleEvent {
  preHandleEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<Event | null> | Event | null;
}

export interface PostHandleEvent {
  postHandleEvent(
    ctx: ClientContext,
    event: Event,
    handleResult: EventHandleResult,
  ): Promise<void> | void;
}

export interface PreBroadcast {
  preBroadcast(
    ctx: ClientContext,
    event: Event,
  ): Promise<Event | null> | Event | null;
}

export interface PostBroadcast {
  postBroadcast(ctx: ClientContext, event: Event): Promise<void> | void;
}
