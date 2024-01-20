import { Event } from './event.interface';

export interface BroadcastService {
  /**
   * This method is called when a new event should be broadcasted. You can send
   * the event to other Nostr Relay servers or other instances of this server.
   *
   * @param event Event to broadcast
   */
  broadcast(event: Event): void | Promise<void>;
}
