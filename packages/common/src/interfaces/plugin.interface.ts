import { ClientContext } from '../client-context';
import { Event, EventHandleResult } from './event.interface';

export type NostrRelayPlugin =
  | BeforeEventHandle
  | AfterEventHandle
  | BeforeEventBroadcast
  | AfterEventBroadcast;

export type BeforeHookResult<T = {}> =
  | { canContinue: true }
  | ({ canContinue: false } & T);

export type BeforeEventHandleResult = BeforeHookResult<{
  result: EventHandleResult;
}>;

export interface BeforeEventHandle {
  beforeEventHandle(
    ctx: ClientContext,
    event: Event,
  ): Promise<BeforeEventHandleResult> | BeforeEventHandleResult;
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
  ): Promise<BeforeHookResult> | BeforeHookResult;
}

export interface AfterEventBroadcast {
  afterEventBroadcast(ctx: ClientContext, event: Event): Promise<void> | void;
}
