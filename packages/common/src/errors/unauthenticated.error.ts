import { BaseError } from './base.error';

export class UnauthenticatedError extends BaseError {
  constructor(message: string = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
