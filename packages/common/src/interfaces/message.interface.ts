import { MessageType } from '../constants';
import { EventId, SubscriptionId } from './common.interface';
import { Event } from './event.interface';
import { Filter } from './filter.interface';

export type IncomingMessage =
  | IncomingEventMessage
  | IncomingReqMessage
  | IncomingCloseMessage
  | IncomingAuthMessage;

export type IncomingEventMessage = [typeof MessageType.EVENT, Event];
export type IncomingReqMessage = [
  typeof MessageType.REQ,
  SubscriptionId,
  ...Filter[],
];
export type IncomingCloseMessage = [typeof MessageType.CLOSE, SubscriptionId];
export type IncomingAuthMessage = [typeof MessageType.AUTH, Event];

export type OutgoingMessage =
  | OutgoingOkMessage
  | OutgoingEventMessage
  | OutgoingEoseMessage
  | OutgoingNoticeMessage
  | OutgoingAuthMessage
  | OutgoingClosedMessage;

export type OutgoingOkMessage = [
  typeof MessageType.OK,
  EventId,
  boolean,
  string,
];
export type OutgoingEventMessage = [
  typeof MessageType.EVENT,
  SubscriptionId,
  Event,
];
export type OutgoingEoseMessage = [typeof MessageType.EOSE, SubscriptionId];
export type OutgoingNoticeMessage = [typeof MessageType.NOTICE, string];
export type OutgoingAuthMessage = [typeof MessageType.AUTH, string];
export type OutgoingClosedMessage = [
  typeof MessageType.CLOSED,
  SubscriptionId,
  string,
];
