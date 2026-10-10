import { LogLevel } from '../constants';
import { Logger } from './logger.interface';

/**
 * Options for NostrRelay
 */
export type NostrRelayOptions = {
  /**
   * Hostname of the Nostr Relay server. If not set, NIP-42 is not enabled.
   * More info: https://github.com/nostr-protocol/nips/blob/master/42.md
   */
  hostname?: string;
  /**
   * Domain name of the Nostr Relay server. If not set, NIP-42 is not enabled.
   * More info: https://github.com/nostr-protocol/nips/blob/master/42.md
   *
   * @deprecated Use hostname instead
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
  /**
   * Maximum number of subscriptions per client. `Default: 20`
   */
  maxSubscriptionsPerClient?: number;
  /** Maximum filters per client REQ or COUNT. `Default: 20` */
  maxFiltersPerRequest?: number;
  /**
   * Maximum live events buffered per subscription during its historical query. `Default: 1000`
   */
  maxPendingEventsPerSubscription?: number;
  /**
   * Deadline for historical queries in milliseconds. `Default: 30000`
   */
  queryTimeoutMs?: number;
  /** Deadline for each plugin initialization or cleanup in milliseconds. `Default: 10000` */
  pluginLifecycleTimeoutMs?: number;
  /** Whether relay.destroy() closes its repository. `Default: true` */
  destroyRepository?: boolean;
};
