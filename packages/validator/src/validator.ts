import { IncomingMessage } from '@nostr-relay/common';
import { ZodError, z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { createIncomingMessageSchema } from './schemas';
import { RawData, RequiredValidatorOptions, ValidatorOptions } from './types';

export class Validator {
  private readonly schema: z.ZodType<IncomingMessage>;

  constructor(options: ValidatorOptions = {}) {
    this.schema = createIncomingMessageSchema(this.defaultOptions(options));
  }

  transformAndValidate(data: RawData): IncomingMessage {
    try {
      return this.schema.parse(this.prepareData(data));
    } catch (error) {
      if (error instanceof ZodError) {
        throw fromZodError(error, {
          prefix: 'invalid',
          maxIssuesInMessage: 1,
        });
      }
      throw error;
    }
  }

  async transformAndValidateAsync(data: RawData): Promise<IncomingMessage> {
    try {
      return await this.schema.parseAsync(this.prepareData(data));
    } catch (error) {
      if (error instanceof ZodError) {
        throw fromZodError(error, {
          prefix: 'invalid',
          maxIssuesInMessage: 1,
        });
      }
      throw error;
    }
  }

  private prepareData(data: RawData): object {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    if (data instanceof ArrayBuffer || data instanceof Buffer) {
      return JSON.parse(data.toString());
    }
    return data;
  }

  private defaultOptions(options: ValidatorOptions): RequiredValidatorOptions {
    return {
      maxItemsPerTag: 10,
      maxLengthPerTagItem: 1024,
      maxNumberOfTags: 2000,
      maxContentLength: 100 * 1024,
      maxSubscriptionIdLength: 128,
      maxFilterIdsLength: 1000,
      maxFilterAuthorsLength: 1000,
      maxFilterKindsLength: 20,
      maxFilterGenericTagsLength: 256,
      maxFilterSearchStringLength: 256,
      ...options,
    };
  }
}
