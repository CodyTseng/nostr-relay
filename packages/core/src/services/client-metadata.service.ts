import { Pubkey, Filter, Client } from '@nostr-relay/common';
import { randomUUID } from 'crypto';
import { LRUCache } from 'lru-cache';

type ClientMetadataOptions = {
  maxSubscriptionsPerClient?: number;
};

type ClientMetadata = {
  id: string;
  pubkey?: Pubkey;
  subscriptions: LRUCache<string, Filter[]>;
};

export class ClientMetadataService {
  private readonly clients = new Map<Client, ClientMetadata>();
  private readonly maxSubscriptionsPerClient: number;

  constructor(options: ClientMetadataOptions = {}) {
    this.maxSubscriptionsPerClient = options.maxSubscriptionsPerClient ?? 20;
  }

  connect(client: Client): ClientMetadata {
    const metadata = {
      id: randomUUID(),
      subscriptions: new LRUCache<string, Filter[]>({
        max: this.maxSubscriptionsPerClient,
      }),
    };
    this.clients.set(client, metadata);
    return metadata;
  }

  disconnect(client: Client): boolean {
    return this.clients.delete(client);
  }

  getMetadata(client: Client): ClientMetadata | undefined {
    return this.clients.get(client);
  }

  getPubkey(client: Client): Pubkey | undefined {
    return this.getMetadata(client)?.pubkey;
  }

  getSubscriptions(client: Client): LRUCache<string, Filter[]> | undefined {
    return this.getMetadata(client)?.subscriptions;
  }

  getId(client: Client): string | undefined {
    return this.getMetadata(client)?.id;
  }

  forEach(callback: (metadata: ClientMetadata, client: Client) => void): void {
    this.clients.forEach((metadata, client) => {
      callback(metadata, client);
    });
  }
}
