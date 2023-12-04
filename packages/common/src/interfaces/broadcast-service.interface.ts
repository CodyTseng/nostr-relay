import { Event } from './event.interface';

export type BroadcastServiceListener = (event: Event) => void;

export interface BroadcastService {
  broadcast(event: Event): void | Promise<void>;
  setListener(listener: BroadcastServiceListener): void;
}
