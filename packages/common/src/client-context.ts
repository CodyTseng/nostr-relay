import { randomUUID } from 'crypto';
import { LRUCache } from 'lru-cache';
import { ClientReadyState } from './enums/client.enum';
import { Client } from './interfaces/client.interface';
import { Filter } from './interfaces/filter.interface';
import { OutgoingMessage } from './interfaces/message.interface';

type ClientContextOptions = {
  maxSubscriptionsPerClient?: number;
};

export class ClientContext {
  readonly id: string;
  readonly subscriptions: LRUCache<string, Filter[]>;

  pubkey: string | undefined;

  constructor(
    private readonly client: Client,
    options: ClientContextOptions = {},
  ) {
    this.id = randomUUID();
    this.subscriptions = new LRUCache<string, Filter[]>({
      max: options.maxSubscriptionsPerClient ?? 20,
    });
  }

  get isOpen(): boolean {
    return this.client.readyState === ClientReadyState.OPEN;
  }

  sendMessage(message: OutgoingMessage): void {
    if (this.isOpen) {
      this.client.send(JSON.stringify(message));
    }
  }
}
