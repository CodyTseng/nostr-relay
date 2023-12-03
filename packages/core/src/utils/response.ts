import {
  Event,
  MessageType,
  OutgoingEoseMessage,
  OutgoingEventMessage,
  OutgoingNoticeMessage,
  OutgoingOkMessage,
  SubscriptionId,
} from '@nostr-relay/common';
import { WebSocket } from 'ws';

export function sendMessage(
  client: WebSocket,
  message: Array<unknown> | undefined | null | void,
): void {
  if (message) {
    client.send(JSON.stringify(message));
  }
}

export function createOutgoingOkMessage(
  eventId: string,
  success: boolean,
  message = '',
): OutgoingOkMessage {
  return [MessageType.OK, eventId, success, message];
}

export function createOutgoingNoticeMessage(
  message: string,
): OutgoingNoticeMessage {
  return [MessageType.NOTICE, message];
}

export function createOutgoingEoseMessage(
  subscriptionId: SubscriptionId,
): OutgoingEoseMessage {
  return [MessageType.EOSE, subscriptionId];
}

export function createOutgoingEventMessage(
  subscriptionId: SubscriptionId,
  event: Event,
): OutgoingEventMessage {
  return [MessageType.EVENT, subscriptionId, event];
}
