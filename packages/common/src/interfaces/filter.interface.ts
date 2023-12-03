import { EventId, Pubkey } from './common.interface';

export interface Filter {
  ids?: EventId[];
  authors?: Pubkey[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: `#${string}`]: string[];
}
