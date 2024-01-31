import { IncomingAuthMessage, MessageType } from '@nostr-relay/common';
import { z } from 'zod';
import { createEventSchema } from './event-message.schema';
import { RequiredValidatorOptions } from '../types';

export function createAuthMessageSchema(
  options: Pick<
    RequiredValidatorOptions,
    'maxTagValueLength' | 'maxNumberOfTags' | 'maxContentLength'
  >,
): z.ZodType<IncomingAuthMessage> {
  return z.tuple([z.literal(MessageType.AUTH), createEventSchema(options)]);
}
