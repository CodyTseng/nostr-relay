import { Event, EventHandleResult } from './event.interface';

export type NostrRelayPlugin =
  | BeforeEventHandle
  | AfterEventHandle
  | BeforeEventBroadcast
  | AfterEventBroadcast;

export interface BeforeEventHandle {
  beforeEventHandle(event: Event): Promise<boolean> | boolean;
}

export interface AfterEventHandle {
  afterEventHandle(
    event: Event,
    handleResult: EventHandleResult,
  ): Promise<EventHandleResult> | EventHandleResult;
}

export interface BeforeEventBroadcast {
  beforeEventBroadcast(event: Event): Promise<boolean> | boolean;
}

export interface AfterEventBroadcast {
  afterEventBroadcast(event: Event): Promise<void> | void;
}
