import { Event } from '../interfaces';
import { AbstractBroadcastService } from './abstract-broadcast.service';

export class LocalBroadcastService extends AbstractBroadcastService {
  emitEvent(event: Event): void {
    super.emit('event', event);
  }
}
