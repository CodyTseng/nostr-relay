export type RawData = Buffer | ArrayBuffer | Buffer[] | string | object;

export type ValidatorOptions = {
  maxItemsPerTag?: number;
  maxLengthPerTagItem?: number;
  maxNumberOfTags?: number;
  maxContentLength?: number;
  maxSubscriptionIdLength?: number;
  maxFilterIdsLength?: number;
  maxFilterAuthorsLength?: number;
  maxFilterKindsLength?: number;
  maxFilterGenericTagsLength?: number;
  maxFilterSearchStringLength?: number;
};
export type RequiredValidatorOptions = Required<ValidatorOptions>;
