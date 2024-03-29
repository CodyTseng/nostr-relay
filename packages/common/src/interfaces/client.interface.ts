import { ClientReadyState } from '../constants';

/**
 * Client interface. Usually a WebSocket.
 */
export interface Client {
  send(data: string, cb?: (err?: Error) => void): void;
  readyState: ClientReadyState;
}
