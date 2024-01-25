import { Event, LogLevel, Logger, MessageType } from '@nostr-relay/common';

/**
 * Options for NostrRelay
 */
export type NostrRelayOptions = {
  /**
   * Domain name of the Nostr Relay server. If not set, NIP-42 is not enabled.
   * More info: https://github.com/nostr-protocol/nips/blob/master/42.md
   */
  domain?: string;
  /**
   * Logger to use. `Default: ConsoleLoggerService`
   */
  logger?: Logger;
  /**
   * The minimum log level to log. `Default: LogLevel.INFO`
   */
  logLevel?: LogLevel;
  createdAtUpperLimit?: number;
  createdAtLowerLimit?: number;
  /**
   * Allowed minimum PoW difficulty for events.` Default: 0`
   */
  minPowDifficulty?: number;
  /**
   * Maximum number of subscriptions per client. `Default: 20`
   */
  maxSubscriptionsPerClient?: number;
  /**
   * TTL for filter result cache in milliseconds. `Default: 1000`
   */
  filterResultCacheTtl?: number;
  /**
   * TTL for event handling result cache in milliseconds. `Default: 600000`
   */
  eventHandlingResultCacheTtl?: number;
};

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
  | ({ messageType: MessageType.REQ } & HandleReqMessageResult)
  | ({ messageType: MessageType.EVENT } & HandleEventMessageResult)
  | ({ messageType: MessageType.CLOSE } & HandleCloseMessageResult)
  | ({ messageType: MessageType.AUTH } & HandleAuthMessageResult)
  | void;
