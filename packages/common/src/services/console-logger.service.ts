import { LogLevel } from '../enums';
import { Logger } from '../interfaces';

export class ConsoleLoggerService implements Logger {
  private logLevel: LogLevel = LogLevel.INFO;

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  debug(...args: any[]): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.debug(...args);
    }
  }

  info(...args: any[]): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(...args);
    }
  }

  warn(...args: any[]): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(...args);
    }
  }

  error(...args: any[]): void {
    if (this.logLevel <= LogLevel.ERROR) {
      console.error(...args);
    }
  }
}
