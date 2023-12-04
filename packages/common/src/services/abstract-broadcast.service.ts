import { EventEmitter } from 'events';
import { Event } from '../interfaces';

export abstract class AbstractBroadcastService extends EventEmitter {
  abstract emitEvent(event: Event): Promise<void> | void;
  on(event: 'event', listener: (event: Event) => void): this {
    return super.on(event, listener);
  }
}
