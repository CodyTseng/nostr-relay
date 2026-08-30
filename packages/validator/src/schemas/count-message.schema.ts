import { Filter, IncomingCountMessage, MessageType } from '@nostr-relay/common';
import { z } from 'zod';
import { RequiredValidatorOptions } from '../types';
import { createSubscriptionIdSchema } from './common.schema';
import { createFilterSchema } from './req-message.schema';

export function createCountMessageSchema(
  options: RequiredValidatorOptions,
): z.ZodType<IncomingCountMessage> {
  return z
    .tuple([z.literal(MessageType.COUNT), createSubscriptionIdSchema(options)])
    .rest(createFilterSchema(options) as z.ZodType<Filter>);
}
