import { Event, Filter, IncomingMessage } from '@nostr-relay/common';
import { ZodError, z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import {
  createEventSchema,
  createFilterSchema,
  createIncomingMessageSchema,
} from './schemas';
import { RawData, RequiredValidatorOptions, ValidatorOptions } from './types';

export class Validator {
  private readonly incomingMessageSchema: z.ZodType<IncomingMessage>;
  private readonly filterSchema: z.ZodType<Filter>;
  private readonly eventSchema: z.ZodType<Event>;

  constructor(options: ValidatorOptions = {}) {
    const defaultOptions = this.defaultOptions(options);
    this.incomingMessageSchema = createIncomingMessageSchema(defaultOptions);
    this.filterSchema = createFilterSchema(defaultOptions);
    this.eventSchema = createEventSchema(defaultOptions);
  }

  async validateIncomingMessage(data: RawData): Promise<IncomingMessage> {
    return await this.errorHandler(() =>
      this.incomingMessageSchema.parseAsync(this.prepareData(data)),
    );
  }

  async validateFilter(data: RawData): Promise<Filter> {
    return await this.errorHandler(() =>
      this.filterSchema.parseAsync(this.prepareData(data)),
    );
  }

  async validateEvent(data: RawData): Promise<Event> {
    return await this.errorHandler(() =>
      this.eventSchema.parseAsync(this.prepareData(data)),
    );
  }

  private async errorHandler<T>(asyncFunc: () => Promise<T>): Promise<T> {
    try {
      return await asyncFunc();
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
