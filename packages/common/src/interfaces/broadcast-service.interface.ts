import { Event } from './event.interface';

export type BroadcastServiceListener = (event: Event) => void;

export interface BroadcastService {
  listener?: BroadcastServiceListener;
  broadcast(event: Event): void | Promise<void>;
}
