import { Filter, IncomingReqMessage, MessageType } from '@nostr-relay/common';
import { z } from 'zod';
import { RequiredValidatorOptions } from '../types';
import {
  EventIdSchema,
  EventKindSchema,
  PubkeySchema,
  TimestampInSecSchema,
  createSearchSchema,
  createSubscriptionIdSchema,
} from './common.schema';

function createGenericTagFilterValuesSchema({
  maxFilterGenericTagsLength,
  maxLengthPerTagItem,
}: Pick<
  RequiredValidatorOptions,
  'maxFilterGenericTagsLength' | 'maxLengthPerTagItem'
>): z.ZodType<string[]> {
  return z
    .array(
      z
        .string({ invalid_type_error: 'must be a string' })
        .max(maxLengthPerTagItem, {
          message: `must be less than or equal to ${maxLengthPerTagItem} characters`,
        }),
    )
    .min(1, { message: 'must be greater than or equal to 1 tagValues' })
    .max(maxFilterGenericTagsLength, {
      message: `must be less than or equal to ${maxFilterGenericTagsLength} tagValues`,
    });
}

export function createFilterSchema(
  options: Pick<
    RequiredValidatorOptions,
    | 'maxSubscriptionIdLength'
    | 'maxFilterIdsLength'
    | 'maxFilterAuthorsLength'
    | 'maxFilterKindsLength'
    | 'maxFilterGenericTagsLength'
    | 'maxLengthPerTagItem'
    | 'maxFilterSearchStringLength'
  >,
): z.ZodType<Filter> {
  const { maxFilterIdsLength, maxFilterAuthorsLength, maxFilterKindsLength } =
    options;
  return z
    .object({
      ids: z.array(EventIdSchema).max(maxFilterIdsLength, {
        message: `must be less than or equal to ${maxFilterIdsLength} ids`,
      }),
      authors: z.array(PubkeySchema).max(maxFilterAuthorsLength, {
        message: `must be less than or equal to ${maxFilterAuthorsLength} authors`,
      }),
      kinds: z.array(EventKindSchema).max(maxFilterKindsLength, {
        message: `must be less than or equal to ${maxFilterKindsLength} kinds`,
      }),
      since: TimestampInSecSchema,
      until: TimestampInSecSchema,
      limit: z
        .number({ invalid_type_error: 'must be a number' })
        .int({ message: 'must be an integer' })
        .min(0, { message: 'must be greater than or equal to 0' }),
      search: createSearchSchema(options),
      // stupid but simple (generated by copilot)
      ['#a']: createGenericTagFilterValuesSchema(options),
      ['#b']: createGenericTagFilterValuesSchema(options),
      ['#c']: createGenericTagFilterValuesSchema(options),
      ['#d']: createGenericTagFilterValuesSchema(options),
      ['#e']: createGenericTagFilterValuesSchema(options),
      ['#f']: createGenericTagFilterValuesSchema(options),
      ['#g']: createGenericTagFilterValuesSchema(options),
      ['#h']: createGenericTagFilterValuesSchema(options),
      ['#i']: createGenericTagFilterValuesSchema(options),
      ['#j']: createGenericTagFilterValuesSchema(options),
      ['#k']: createGenericTagFilterValuesSchema(options),
      ['#l']: createGenericTagFilterValuesSchema(options),
      ['#m']: createGenericTagFilterValuesSchema(options),
      ['#n']: createGenericTagFilterValuesSchema(options),
      ['#o']: createGenericTagFilterValuesSchema(options),
      ['#p']: createGenericTagFilterValuesSchema(options),
      ['#q']: createGenericTagFilterValuesSchema(options),
      ['#r']: createGenericTagFilterValuesSchema(options),
      ['#s']: createGenericTagFilterValuesSchema(options),
      ['#t']: createGenericTagFilterValuesSchema(options),
      ['#u']: createGenericTagFilterValuesSchema(options),
      ['#v']: createGenericTagFilterValuesSchema(options),
      ['#w']: createGenericTagFilterValuesSchema(options),
      ['#x']: createGenericTagFilterValuesSchema(options),
      ['#y']: createGenericTagFilterValuesSchema(options),
      ['#z']: createGenericTagFilterValuesSchema(options),
      ['#A']: createGenericTagFilterValuesSchema(options),
      ['#B']: createGenericTagFilterValuesSchema(options),
      ['#C']: createGenericTagFilterValuesSchema(options),
      ['#D']: createGenericTagFilterValuesSchema(options),
      ['#E']: createGenericTagFilterValuesSchema(options),
      ['#F']: createGenericTagFilterValuesSchema(options),
      ['#G']: createGenericTagFilterValuesSchema(options),
      ['#H']: createGenericTagFilterValuesSchema(options),
      ['#I']: createGenericTagFilterValuesSchema(options),
      ['#J']: createGenericTagFilterValuesSchema(options),
      ['#K']: createGenericTagFilterValuesSchema(options),
      ['#L']: createGenericTagFilterValuesSchema(options),
      ['#M']: createGenericTagFilterValuesSchema(options),
      ['#N']: createGenericTagFilterValuesSchema(options),
      ['#O']: createGenericTagFilterValuesSchema(options),
      ['#P']: createGenericTagFilterValuesSchema(options),
      ['#Q']: createGenericTagFilterValuesSchema(options),
      ['#R']: createGenericTagFilterValuesSchema(options),
      ['#S']: createGenericTagFilterValuesSchema(options),
      ['#T']: createGenericTagFilterValuesSchema(options),
      ['#U']: createGenericTagFilterValuesSchema(options),
      ['#V']: createGenericTagFilterValuesSchema(options),
      ['#W']: createGenericTagFilterValuesSchema(options),
      ['#X']: createGenericTagFilterValuesSchema(options),
      ['#Y']: createGenericTagFilterValuesSchema(options),
      ['#Z']: createGenericTagFilterValuesSchema(options),
    })
    .partial();
}

export function createReqMessageSchema(
  options: Pick<
    RequiredValidatorOptions,
    | 'maxSubscriptionIdLength'
    | 'maxFilterIdsLength'
    | 'maxFilterAuthorsLength'
    | 'maxFilterKindsLength'
    | 'maxFilterGenericTagsLength'
    | 'maxLengthPerTagItem'
    | 'maxFilterSearchStringLength'
  >,
): z.ZodType<IncomingReqMessage> {
  return z
    .tuple([z.literal(MessageType.REQ), createSubscriptionIdSchema(options)])
    .rest(createFilterSchema(options));
}
