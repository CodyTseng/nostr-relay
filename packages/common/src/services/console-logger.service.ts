import { LoggerLevel } from '../enums';
import { Logger, LoggerOptions } from '../interfaces';

export class ConsoleLoggerService implements Logger {
  private context?: string;
  private level: LoggerLevel;

  constructor(options?: LoggerOptions) {
    this.context = options?.context;
    this.level = options?.level ?? LoggerLevel.INFO;
  }

  trace(msgOrObj: string | unknown, msg?: string, ...args: any[]): void {
    if ([LoggerLevel.TRACE].includes(this.level)) return;

    console.log(this.formatLogMsg(LoggerLevel.TRACE, msgOrObj, msg), ...args);
  }

  debug(msgOrObj: string | unknown, msg?: string, ...args: any[]): void {
    if ([LoggerLevel.TRACE, LoggerLevel.DEBUG].includes(this.level)) return;

    console.log(this.formatLogMsg(LoggerLevel.DEBUG, msgOrObj, msg), ...args);
  }

  info(msgOrObj: string | unknown, msg?: string, ...args: any[]): void {
    if (
      [LoggerLevel.TRACE, LoggerLevel.DEBUG, LoggerLevel.INFO].includes(
        this.level,
      )
    ) {
      return;
    }

    console.log(this.formatLogMsg(LoggerLevel.INFO, msgOrObj, msg), ...args);
  }

  warn(msgOrObj: string | unknown, msg?: string, ...args: any[]): void {
    if (
      [
        LoggerLevel.TRACE,
        LoggerLevel.DEBUG,
        LoggerLevel.INFO,
        LoggerLevel.WARN,
      ].includes(this.level)
    ) {
      return;
    }

    console.log(this.formatLogMsg(LoggerLevel.WARN, msgOrObj, msg), ...args);
  }

  error(msgOrObj: string | unknown, msg?: string, ...args: any[]): void {
    if (
      [
        LoggerLevel.TRACE,
        LoggerLevel.DEBUG,
        LoggerLevel.INFO,
        LoggerLevel.WARN,
        LoggerLevel.ERROR,
      ].includes(this.level)
    ) {
      return;
    }

    console.log(this.formatLogMsg(LoggerLevel.ERROR, msgOrObj, msg), ...args);
  }

  fatal(msgOrObj: string | unknown, msg?: string, ...args: any[]): void {
    if (
      [
        LoggerLevel.TRACE,
        LoggerLevel.DEBUG,
        LoggerLevel.INFO,
        LoggerLevel.WARN,
        LoggerLevel.ERROR,
        LoggerLevel.FATAL,
      ].includes(this.level)
    ) {
      return;
    }

    console.log(this.formatLogMsg(LoggerLevel.FATAL, msgOrObj, msg), ...args);
  }

  setContext(value: string): void {
    this.context = value;
  }

  private formatLogMsg(
    level: LoggerLevel,
    msgOrObj: string | unknown,
    msg?: string,
  ): string {
    let logMsg = `[${level}] `;
    if (this.context) logMsg += `[${this.context}] `;
    logMsg += ': ';

    if (typeof msgOrObj === 'string') {
      logMsg += `${msgOrObj} `;
    } else {
      logMsg += `data:${JSON.stringify(msgOrObj)} `;
      if (msg) logMsg += msg;
    }

    return logMsg;
  }
}
