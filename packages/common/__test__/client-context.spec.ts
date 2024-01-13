import { Client, ClientReadyState } from '../src';
import { ClientContext } from '../src/client-context';

describe('ClientContext', () => {
  let client: Client;
  let ctx: ClientContext;

  beforeEach(() => {
    client = {
      readyState: ClientReadyState.OPEN,
      send: jest.fn(),
    };
    ctx = new ClientContext(client);
  });

  it('should initialize with correct values', () => {
    expect(ctx.id).toBeTruthy();
    expect(ctx.subscriptions).toBeTruthy();
    expect(ctx.subscriptions.max).toBe(20);
  });

  describe('isOpen', () => {
    it('should return true when client readyState is OPEN', () => {
      client.readyState = ClientReadyState.OPEN;
      expect(ctx.isOpen).toBe(true);
    });

    it('should return false when client readyState is not OPEN', () => {
      client.readyState = ClientReadyState.CLOSED; // Or any other state
      expect(ctx.isOpen).toBe(false);
    });
  });

  describe('sendMessage', () => {
    const message = ['TEST'] as any;

    it('should send message when client readyState is OPEN', () => {
      client.readyState = ClientReadyState.OPEN;
      ctx.sendMessage(message);
      expect(client.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should not send message when client readyState is not OPEN', () => {
      client.readyState = ClientReadyState.CLOSED; // Or any other state
      ctx.sendMessage(message);
      expect(client.send).not.toHaveBeenCalled();
    });
  });
});
