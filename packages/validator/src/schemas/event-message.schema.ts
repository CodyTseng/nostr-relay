import { IncomingEventMessage, MessageType } from '@nostr-relay/common';
import { z } from 'zod';
import {
  EventIdSchema,
  EventKindSchema,
  EventSigSchema,
  PubkeySchema,
  TimestampInSecSchema,
  createEventContentSchema,
  createEventTagSchema,
} from './common.schema';
import { RequiredValidatorOptions } from '../types';

export function createEventSchema(
  options: Pick<
    RequiredValidatorOptions,
    | 'maxItemsPerTag'
    | 'maxLengthPerTagItem'
    | 'maxNumberOfTags'
    | 'maxContentLength'
  >,
) {
  return z.object({
    id: EventIdSchema,
    pubkey: PubkeySchema,
    created_at: TimestampInSecSchema,
    kind: EventKindSchema,
    tags: z.array(createEventTagSchema(options)).max(options.maxNumberOfTags, {
      message: `must less than or equal to ${options.maxNumberOfTags} tags`,
    }),
    content: createEventContentSchema(options),
    sig: EventSigSchema,
  });
}

export function createEventMessageSchema(
  options: Pick<
    RequiredValidatorOptions,
    | 'maxItemsPerTag'
    | 'maxLengthPerTagItem'
    | 'maxNumberOfTags'
    | 'maxContentLength'
  >,
): z.ZodType<IncomingEventMessage> {
  return z.tuple([z.literal(MessageType.EVENT), createEventSchema(options)]);
}
