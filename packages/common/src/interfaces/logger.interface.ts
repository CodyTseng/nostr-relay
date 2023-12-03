import { LoggerLevel } from '../enums';

export interface LoggerOptions {
  context?: string;
  level?: LoggerLevel;
}

export interface Logger {
  trace(msg: string, ...args: any[]): void;
  trace(obj: unknown, msg?: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
  debug(obj: unknown, msg?: string, ...args: any[]): void;
  info(msg: string, ...args: any[]): void;
  info(obj: unknown, msg?: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  warn(obj: unknown, msg?: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  error(obj: unknown, msg?: string, ...args: any[]): void;
  fatal(msg: string, ...args: any[]): void;
  fatal(obj: unknown, msg?: string, ...args: any[]): void;
  setContext(value: string): void;
}
