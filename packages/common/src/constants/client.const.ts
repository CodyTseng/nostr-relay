/**
 * Same as WebSocket readyState
 */
export const ClientReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;
export type ClientReadyState =
  (typeof ClientReadyState)[keyof typeof ClientReadyState];
