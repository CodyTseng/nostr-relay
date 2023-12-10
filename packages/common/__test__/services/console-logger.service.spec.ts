import { ConsoleLoggerService } from '../../src/services';

describe('ConsoleLoggerService', () => {
  let logger: ConsoleLoggerService;

  beforeEach(() => {
    logger = new ConsoleLoggerService();
  });

  describe('error', () => {
    it('should log error', () => {
      const context = 'test';
      const error = new Error('error');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      logger.error(context, error);

      expect(consoleSpy).toHaveBeenCalledWith(`[${context}]`, error);
    });
  });
});
