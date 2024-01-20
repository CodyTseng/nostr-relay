import { Event } from './event.interface';

export interface BroadcastService {
  broadcast(event: Event): void | Promise<void>;
}
