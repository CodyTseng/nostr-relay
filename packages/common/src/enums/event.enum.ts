export enum EventType {
  /**
   * Regular event
   */
  REGULAR = 'REGULAR',
  /**
   * Replaceable event
   */
  REPLACEABLE = 'REPLACEABLE',
  /**
   * Ephemeral event
   */
  EPHEMERAL = 'EPHEMERAL',
  /**
   * Parameterized replaceable event
   */
  PARAMETERIZED_REPLACEABLE = 'PARAMETERIZED_REPLACEABLE',
}

/**
 * Some special event kinds
 */
export enum EventKind {
  SET_METADATA = 0,
  TEXT_NOTE = 1,
  RECOMMEND_SERVER = 2,
  CONTACT_LIST = 3,
  ENCRYPTED_DIRECT_MESSAGE = 4,
  DELETION = 5,
  // Channel
  CHANNEL_CREATION = 40,
  CHANNEL_METADATA = 41,
  CHANNEL_MESSAGE = 42,
  CHANNEL_HIDE_MESSAGE = 43,
  CHANNEL_MUTE_USER = 44,
  CHANNEL_RESERVE_FIRST = 45,
  CHANNEL_RESERVE_LAST = 49,
  // Regular Events
  REGULAR_FIRST = 1000,
  REGULAR_LAST = 9999,
  // Replaceable Events
  REPLACEABLE_FIRST = 10000,
  REPLACEABLE_LAST = 19999,
  // Ephemeral Events
  EPHEMERAL_FIRST = 20000,
  AUTHENTICATION = 22242,
  EPHEMERAL_LAST = 29999,
  // Parameterized Replaceable Events
  PARAMETERIZED_REPLACEABLE_FIRST = 30000,
  LONG_FORM_CONTENT = 30023,
  PARAMETERIZED_REPLACEABLE_LAST = 39999,
}

export enum TagName {
  EVENT_COORDINATES = 'a',
  EVENT = 'e',
  PUBKEY = 'p',
  D = 'd',
  NONCE = 'nonce',
  EXPIRATION = 'expiration',
  DELEGATION = 'delegation',
  RELAY = 'relay',
  CHALLENGE = 'challenge',
}
