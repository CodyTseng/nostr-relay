import { Event } from './event.interface';

export type BroadcastServiceListener = (event: Event) => void;

/**
 * This interface describes a service that can broadcast events to all clients.
 * You can implement this interface to create your own broadcast service.
 * BroadcastService will be set listener automatically when the nostr-relay server
 * starts. And the broadcast method will be called when a new event should be
 * broadcasted.
 */
export interface BroadcastService {
  /**
   * This listener can broadcast a event to all clients in this instance. Usually
   * you don't need to set this property manually.
   */
  listener?: BroadcastServiceListener;

  /**
   * This method is called when a new event should be broadcasted.
   * You can implement this method to broadcast the event to all clients in this
   * instance. by calling `listener(event)`. You can also send the event to other
   * Nostr Relay servers or other instances of this service.
   *
   * @param event Event to broadcast
   */
  broadcast(event: Event): void | Promise<void>;
}
