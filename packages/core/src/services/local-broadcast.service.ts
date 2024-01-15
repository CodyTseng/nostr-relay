import {
  BroadcastService,
  BroadcastServiceListener,
  Event,
} from '@nostr-relay/common';

export class LocalBroadcastService implements BroadcastService {
  listener?: BroadcastServiceListener;

  broadcast(event: Event): void {
    if (this.listener) {
      process.nextTick(() => this.listener!(event));
    }
  }
}
