import { IncomingCloseMessage, MessageType } from '@nostr-relay/common';
import { z } from 'zod';
import { createSubscriptionIdSchema } from './common.schema';
import { RequiredValidatorOptions } from '../types';

export function createCloseMessageSchema(
  options: Pick<RequiredValidatorOptions, 'maxSubscriptionIdLength'>,
): z.ZodType<IncomingCloseMessage> {
  return z.tuple([
    z.literal(MessageType.CLOSE),
    createSubscriptionIdSchema(options),
  ]);
}
