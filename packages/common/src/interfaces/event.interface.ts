import { EventId, Pubkey, Signature, Tag } from './common.interface';

export interface Event {
  id: EventId;
  pubkey: Pubkey;
  created_at: number;
  kind: number;
  tags: Tag[];
  content: string;
  sig: Signature;
}

export type EventHandleResult = {
  success: boolean;
  message?: string;
  noReplyNeeded?: boolean;
};
