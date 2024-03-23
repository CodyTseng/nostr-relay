export type EventId = string;
export type Pubkey = string;
export type Signature = string;
export type Tag = string[];

export type SubscriptionId = string;

export type KeysOfUnion<T> = T extends T ? keyof T : never;
