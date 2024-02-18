import { randomUUID } from 'crypto';
import { LRUCache } from 'lru-cache';
import { ClientReadyState } from './constants';
import { Client } from './interfaces/client.interface';
import { Filter } from './interfaces/filter.interface';
import { OutgoingMessage } from './interfaces/message.interface';

/**
 * Client context options
 */
export type ClientContextOptions = {
  /**
   * Maximum number of subscriptions per client. `Default: 20`
   */
  maxSubscriptionsPerClient?: number;
};

/**
 * Client context.
 */
export class ClientContext {
  /**
   * Client ID, a random UUID. Also used as the AUTH challenge.
   */
  readonly id: string;
  /**
   * Subscriptions of the client. The key is the subscription ID. The value is the filters.
   */
  readonly subscriptions: LRUCache<string, Filter[]>;

  /**
   * Public key of the client. Will be set after the client sends an AUTH message.
   */
  pubkey: string | undefined;

  /**
   * Create a new ClientContext instance. Usually you don't need to create this.
   *
   * @param client Client instance, usually a WebSocket
   * @param options Client context options
   */
  constructor(
    private readonly client: Client,
    options: ClientContextOptions = {},
  ) {
    this.id = randomUUID();
    this.subscriptions = new LRUCache<string, Filter[]>({
      max: options.maxSubscriptionsPerClient ?? 20,
    });
  }

  /**
   * Whether the client is open. Only can send messages when the client is open.
   */
  get isOpen(): boolean {
    return this.client.readyState === ClientReadyState.OPEN;
  }

  /**
   * Send a message to the client. It will be ignored if the client is not open.
   *
   * @param message Outgoing message
   */
  sendMessage(message: OutgoingMessage): void {
    if (this.isOpen) {
      this.client.send(JSON.stringify(message));
    }
  }
}
