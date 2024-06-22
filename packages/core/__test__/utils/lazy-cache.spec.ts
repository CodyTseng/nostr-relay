import { LazyCache } from '../../src/utils';

describe('LazyCache', () => {
  let cache: LazyCache<string, Promise<string>>;

  beforeEach(() => {
    cache = new LazyCache({ max: 1000 });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('get', () => {
    it('should only call callback once for the same key', async () => {
      const callback = jest.fn(async () => 'world');

      const results = await Promise.all([
        cache.get('hello', callback),
        cache.get('hello', callback),
        cache.get('hello', callback),
      ]);

      expect(results).toEqual(['world', 'world', 'world']);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  it('clear', () => {
    cache.get('hello', async () => 'world');
    expect(cache['cache'].size).toBe(1);

    cache.clear();
    expect(cache['cache'].size).toBe(0);
  });
});
