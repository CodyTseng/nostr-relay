import { MessageType } from '../constants';
import { Event } from './event.interface';

/**
 * Result of handling REQ message
 */
export type HandleReqMessageResult = {
  /**
   * The events that match the request
   */
  events: Event[];
};

/**
 * Result of handling EVENT message
 */
export type HandleEventMessageResult = {
  /**
   * Whether the event was successfully handled
   */
  success: boolean;
  /**
   * Message to send to the client
   */
  message?: string;
};

/**
 * Result of handling CLOSE message
 */
export type HandleCloseMessageResult = {
  /**
   * Whether the subscription was successfully closed
   */
  success: boolean;
};

/**
 * Result of handling AUTH message
 */
export type HandleAuthMessageResult = {
  /**
   * Whether the authentication was successful
   */
  success: boolean;
};

/**
 * Result of handling an incoming message
 */
export type HandleMessageResult =
  | ({ messageType: typeof MessageType.REQ } & HandleReqMessageResult)
  | ({ messageType: typeof MessageType.EVENT } & HandleEventMessageResult)
  | ({ messageType: typeof MessageType.CLOSE } & HandleCloseMessageResult)
  | ({ messageType: typeof MessageType.AUTH } & HandleAuthMessageResult)
  | void;
