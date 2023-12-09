import { ClientReadyState } from '../enums';

export interface Client {
  send(data: string, cb?: (err?: Error) => void): void;
  readyState: ClientReadyState;
}
