import { MessageType } from '../enums';
import { EventId, SubscriptionId } from './common.interface';
import { Event } from './event.interface';
import { Filter } from './filter.interface';

export type MessageTypeEvent = MessageType.EVENT | 'EVENT';
export type MessageTypeReq = MessageType.REQ | 'REQ';
export type MessageTypeClose = MessageType.CLOSE | 'CLOSE';
export type MessageTypeAuth = MessageType.AUTH | 'AUTH';
export type MessageTypeOk = MessageType.OK | 'OK';
export type MessageTypeEose = MessageType.EOSE | 'EOSE';
export type MessageTypeNotice = MessageType.NOTICE | 'NOTICE';

export type IncomingMessage =
  | IncomingEventMessage
  | IncomingReqMessage
  | IncomingCloseMessage
  | IncomingAuthMessage;

export type IncomingEventMessage = [MessageTypeEvent, Event];
export type IncomingReqMessage = [MessageTypeReq, SubscriptionId, ...Filter[]];
export type IncomingCloseMessage = [MessageTypeClose, SubscriptionId];
export type IncomingAuthMessage = [MessageTypeAuth, Event];

export type OutgoingMessage =
  | OutgoingOkMessage
  | OutgoingEventMessage
  | OutgoingEoseMessage
  | OutgoingNoticeMessage
  | OutgoingAuthMessage;

export type OutgoingOkMessage = [MessageTypeOk, EventId, boolean, string];
export type OutgoingEventMessage = [MessageTypeEvent, SubscriptionId, Event];
export type OutgoingEoseMessage = [MessageTypeEose, SubscriptionId];
export type OutgoingNoticeMessage = [MessageTypeNotice, string];
export type OutgoingAuthMessage = [MessageTypeAuth, string];
