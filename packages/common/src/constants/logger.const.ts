export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
