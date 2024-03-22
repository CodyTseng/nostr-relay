import { LogLevel, Logger } from '@nostr-relay/common';

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
