export type RawData = Buffer | ArrayBuffer | Buffer[] | string | object;

/**
 * Validator options
 */
export type ValidatorOptions = {
  /**
   * maximum length of tag value. `Default: 1024`
   */
  maxTagValueLength?: number;
  /**
   * maximum number of tags. `Default: 2000`
   */
  maxNumberOfTags?: number;
  /**
   * maximum length of content. `Default: 102400`
   */
  maxContentLength?: number;
  /**
   * maximum length of subscription id. `Default: 128`
   */
  maxSubscriptionIdLength?: number;
  /**
   * maximum length of id filter set. `Default: 1000`
   */
  maxFilterIdsLength?: number;
  /**
   * maximum length of author filter set. `Default: 1000`
   */
  maxFilterAuthorsLength?: number;
  /**
   * maximum length of kind filter set. `Default: 20`
   */
  maxFilterKindsLength?: number;
  /**
   * maximum length of generic tag filter set. `Default: 256`
   */
  maxFilterGenericTagsLength?: number;
  /**
   * maximum length of search string. `Default: 256`
   */
  maxFilterSearchStringLength?: number;
  /**
   * enable NIP-91 (delegated Nostr) validation. `Default: false`
   */
  enableNipNd?: boolean;
};
export type RequiredValidatorOptions = Required<ValidatorOptions>;
