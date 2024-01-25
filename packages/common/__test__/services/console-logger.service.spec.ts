import { LogLevel, ConsoleLoggerService } from '../../src';

describe('ConsoleLoggerService', () => {
  let logger: ConsoleLoggerService;

  beforeEach(() => {
    logger = new ConsoleLoggerService();
  });

  describe('setLogLevel', () => {
    it('should set the log level', () => {
      logger.setLogLevel(LogLevel.WARN);
      expect((logger as any).logLevel).toEqual(LogLevel.WARN);
    });
  });

  describe('debug', () => {
    it('should log debug when log level is DEBUG', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('debug message');
      expect(consoleSpy).toHaveBeenCalledWith('debug message');
    });

    it('should not log debug when log level is higher than DEBUG', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
      logger.setLogLevel(LogLevel.INFO);
      logger.debug('debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info when log level is lower than INFO', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      logger.setLogLevel(LogLevel.DEBUG);
      logger.info('info message');
      expect(consoleSpy).toHaveBeenCalledWith('info message');
    });

    it('should log info when log level is INFO', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      logger.setLogLevel(LogLevel.INFO);
      logger.info('info message');
      expect(consoleSpy).toHaveBeenCalledWith('info message');
    });

    it('should not log info when log level is higher than INFO', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      logger.setLogLevel(LogLevel.WARN);
      logger.info('info message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warn when log level is lower than WARN', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      logger.setLogLevel(LogLevel.INFO);
      logger.warn('warn message');
      expect(consoleSpy).toHaveBeenCalledWith('warn message');
    });

    it('should log warn when log level is WARN', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      logger.setLogLevel(LogLevel.WARN);
      logger.warn('warn message');
      expect(consoleSpy).toHaveBeenCalledWith('warn message');
    });

    it('should not log warn when log level is higher than WARN', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      logger.setLogLevel(LogLevel.ERROR);
      logger.warn('warn message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error when log level is lower than ERROR', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      logger.setLogLevel(LogLevel.WARN);
      logger.error('error message');
      expect(consoleSpy).toHaveBeenCalledWith('error message');
    });

    it('should log error when log level is ERROR', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('error message');
      expect(consoleSpy).toHaveBeenCalledWith('error message');
    });

    it('should not log error when log level is higher than ERROR', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('error message');
      expect(consoleSpy).toHaveBeenCalledWith('error message');
    });
  });
});
