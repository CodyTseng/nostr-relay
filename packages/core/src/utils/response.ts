import {
  Event,
  MessageType,
  OutgoingAuthMessage,
  OutgoingEoseMessage,
  OutgoingEventMessage,
  OutgoingNoticeMessage,
  OutgoingOkMessage,
  SubscriptionId,
} from '@nostr-relay/common';

/**
 * Create an outgoing OK message.
 * More info: https://github.com/nostr-protocol/nips/blob/master/01.md
 *
 * @param eventId Event Id to respond to
 * @param success Whether the event was successfully handled
 * @param message Message to send to the client
 */
export function createOutgoingOkMessage(
  eventId: string,
  success: boolean,
  message = '',
): OutgoingOkMessage {
  return [MessageType.OK, eventId, success, message];
}

/**
 * Create an outgoing NOTICE message.
 * More info: https://github.com/nostr-protocol/nips/blob/master/01.md
 *
 * @param message Notice message to send to the client
 */
export function createOutgoingNoticeMessage(
  message: string,
): OutgoingNoticeMessage {
  return [MessageType.NOTICE, message];
}

/**
 * Create an outgoing EOSE message.
 * More info: https://github.com/nostr-protocol/nips/blob/master/01.md
 *
 * @param subscriptionId Subscription Id
 */
export function createOutgoingEoseMessage(
  subscriptionId: SubscriptionId,
): OutgoingEoseMessage {
  return [MessageType.EOSE, subscriptionId];
}

/**
 * Create an outgoing EVENT message.
 * More info: https://github.com/nostr-protocol/nips/blob/master/01.md
 *
 * @param subscriptionId Subscription Id
 * @param event Event requested by the client
 */
export function createOutgoingEventMessage(
  subscriptionId: SubscriptionId,
  event: Event,
): OutgoingEventMessage {
  return [MessageType.EVENT, subscriptionId, event];
}

/**
 * Create an outgoing AUTH message.
 * More info: https://github.com/nostr-protocol/nips/blob/master/42.md
 *
 * @param challenge challenge string
 */
export function createOutgoingAuthMessage(
  challenge: string,
): OutgoingAuthMessage {
  return [MessageType.AUTH, challenge];
}
