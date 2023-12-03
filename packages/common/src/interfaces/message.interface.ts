import { MessageType } from '../enums';
import { EventId, SubscriptionId } from './common.interface';
import { Event } from './event.interface';
import { Filter } from './filter.interface';

export type IncomingMessage =
  | IncomingEventMessage
  | IncomingReqMessage
  | IncomingCloseMessage
  | IncomingAuthMessage;

export type IncomingEventMessage = [MessageType.EVENT, Event];
export type IncomingReqMessage = [MessageType.REQ, SubscriptionId, ...Filter[]];
export type IncomingCloseMessage = [MessageType.CLOSE, SubscriptionId];
export type IncomingAuthMessage = [MessageType.AUTH, Event];

export type OutgoingMessage =
  | OutgoingOkMessage
  | OutgoingEventMessage
  | OutgoingEoseMessage
  | OutgoingNoticeMessage;

export type OutgoingOkMessage = [MessageType.OK, EventId, boolean, string];
export type OutgoingEventMessage = [MessageType.EVENT, SubscriptionId, Event];
export type OutgoingEoseMessage = [MessageType.EOSE, SubscriptionId];
export type OutgoingNoticeMessage = [MessageType.NOTICE, string];
