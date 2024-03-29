import { z } from 'zod';
import { RequiredValidatorOptions } from '../types';

export const TimestampInSecSchema = z
  .number({ invalid_type_error: 'must be a number' })
  .int({ message: 'must be an integer' })
  .min(0, { message: 'must be greater than or equal to 0' });

export const HexStringSchema = z
  .string({ invalid_type_error: 'must be a string' })
  .regex(/^[0-9a-f]+$/, { message: 'must be a hex string' });

export const EventIdSchema = HexStringSchema.length(64, {
  message: `must be ${64} characters`,
});

export const PubkeySchema = HexStringSchema.length(64, {
  message: `must be ${64} characters`,
});

export const EventKindSchema = z
  .number({ invalid_type_error: 'must be a number' })
  .int({ message: 'must be an integer' })
  .min(0, { message: 'must be greater than or equal to 0' });

export const EventSigSchema = HexStringSchema.length(128, {
  message: `must be ${128} characters`,
});

export function createEventTagSchema({
  maxTagValueLength,
}: Pick<RequiredValidatorOptions, 'maxTagValueLength'>): z.ZodType<string[]> {
  return z.array(z.string({ invalid_type_error: 'must be a string' })).refine(
    tag => {
      if (tag.length <= 1 || tag[0].length > 1) return true;
      return tag[1].length <= maxTagValueLength;
    },
    {
      message: `tag value must be less than ${maxTagValueLength} chars`,
    },
  );
}

export function createEventContentSchema({
  maxContentLength,
}: Pick<RequiredValidatorOptions, 'maxContentLength'>): z.ZodType<string> {
  return z
    .string({ invalid_type_error: 'must be a string' })
    .max(maxContentLength, {
      message: `must be less than or equal to ${maxContentLength} chars`,
    });
}

export function createSubscriptionIdSchema({
  maxSubscriptionIdLength,
}: Pick<
  RequiredValidatorOptions,
  'maxSubscriptionIdLength'
>): z.ZodType<string> {
  return z
    .string({ invalid_type_error: 'must be a string' })
    .min(1, { message: 'must be at least 1 character' })
    .max(maxSubscriptionIdLength, {
      message: `must be less than or equal to ${maxSubscriptionIdLength} characters`,
    });
}

export function createSearchSchema({
  maxFilterSearchStringLength,
}: Pick<
  RequiredValidatorOptions,
  'maxFilterSearchStringLength'
>): z.ZodType<string> {
  return z
    .string({ invalid_type_error: 'must be a string' })
    .max(maxFilterSearchStringLength, {
      message: `must be less than or equal to ${maxFilterSearchStringLength} chars`,
    });
}
