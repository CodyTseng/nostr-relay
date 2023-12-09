export interface Logger {
  error(context: string, error: Error): void;
}
