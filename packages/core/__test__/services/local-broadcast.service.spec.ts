import { BroadcastServiceListener, Event } from '../../../common';
import { LocalBroadcastService } from '../../src/services/local-broadcast.service';

describe('LocalBroadcastService', () => {
  let localBroadcastService: LocalBroadcastService;
  let listener: BroadcastServiceListener;

  beforeEach(() => {
    localBroadcastService = new LocalBroadcastService();
    listener = jest.fn();
  });

  it('should broadcast event', async () => {
    localBroadcastService.setListener(listener);

    const event = {} as Event;
    localBroadcastService.broadcast(event);

    await new Promise(resolve => process.nextTick(resolve));
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('should not broadcast event if listener is not set', async () => {
    localBroadcastService.broadcast({} as Event);

    await new Promise(resolve => process.nextTick(resolve));
    expect(listener).not.toHaveBeenCalled();
  });
});
