import { Logger } from '../interfaces';

export class ConsoleLoggerService implements Logger {
  error(context: string, error: Error): void {
    console.log(`[${context}]`, error);
  }
}
