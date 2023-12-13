import { IncomingMessage } from '@nostr-relay/common';
import { z } from 'zod';
import { createAuthMessageSchema } from './auth-message.schema';
import { createCloseMessageSchema } from './close-message.schema';
import { createEventMessageSchema } from './event-message.schema';
import { createReqMessageSchema } from './req-message.schema';
import { RequiredValidatorOptions } from '../types';

export function createIncomingMessageSchema(
  options: RequiredValidatorOptions,
): z.ZodType<IncomingMessage> {
  return z.union([
    createEventMessageSchema(options),
    createCloseMessageSchema(options),
    createReqMessageSchema(options),
    createAuthMessageSchema(options),
  ]);
}
