import { ClientContext } from '../client-context';
import { Event, EventHandleResult } from './event.interface';

export type NostrRelayPlugin =
  | BeforeEventHandle
  | AfterEventHandle
  | BeforeEventBroadcast
  | AfterEventBroadcast;

export interface BeforeEventHandle {
  beforeEventHandle(
    ctx: ClientContext,
    event: Event,
  ): Promise<boolean> | boolean;
}

export interface AfterEventHandle {
  afterEventHandle(
    ctx: ClientContext,
    event: Event,
    handleResult: EventHandleResult,
  ): Promise<void> | void;
}

export interface BeforeEventBroadcast {
  beforeEventBroadcast(
    ctx: ClientContext,
    event: Event,
  ): Promise<boolean> | boolean;
}

export interface AfterEventBroadcast {
  afterEventBroadcast(ctx: ClientContext, event: Event): Promise<void> | void;
}
