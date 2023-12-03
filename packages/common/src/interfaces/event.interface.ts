import { EventId, Pubkey, Siganature, Tag } from './common.interface';

export interface Event {
  id: EventId;
  pubkey: Pubkey;
  createdAt: number;
  kind: number;
  tags: Tag[];
  content: string;
  sig: Siganature;
}
