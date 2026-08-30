export const MessageType = {
  REQ: 'REQ',
  EVENT: 'EVENT',
  CLOSE: 'CLOSE',
  AUTH: 'AUTH',
  COUNT: 'COUNT',
  EOSE: 'EOSE',
  OK: 'OK',
  NOTICE: 'NOTICE',
  CLOSED: 'CLOSED',
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];
