import { Event, Filter, IncomingMessage } from '@nostr-relay/common';
import { ZodError, z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import {
  createEventSchema,
  createFilterSchema,
  createIncomingMessageSchema,
} from './schemas';
import { RawData, RequiredValidatorOptions, ValidatorOptions } from './types';

/**
 * Zod based validator for Nostr Relay messages
 */
export class Validator {
  private readonly incomingMessageSchema: z.ZodType<IncomingMessage>;
  private readonly filterSchema: z.ZodType<Filter>;
  private readonly eventSchema: z.ZodType<Event>;

  /**
   * Create a new validator
   *
   * @param options Validator options
   */
  constructor(options: ValidatorOptions = {}) {
    const defaultOptions = this.defaultOptions(options);
    this.incomingMessageSchema = createIncomingMessageSchema(defaultOptions);
    this.filterSchema = createFilterSchema(defaultOptions);
    this.eventSchema = createEventSchema(defaultOptions);
  }

  /**
   * Validate incoming message
   *
   * @param data data to validate
   */
  async validateIncomingMessage(data: RawData): Promise<IncomingMessage> {
    return await this.errorHandler(() =>
      this.incomingMessageSchema.parseAsync(this.prepareData(data)),
    );
  }

  /**
   * Validate filter
   *
   * @param data data to validate
   * @returns
   */
  async validateFilter(data: RawData): Promise<Filter> {
    return await this.errorHandler(() =>
      this.filterSchema.parseAsync(this.prepareData(data)),
    );
  }

  /**
   * Validate event
   *
   * @param data data to validate
   */
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
