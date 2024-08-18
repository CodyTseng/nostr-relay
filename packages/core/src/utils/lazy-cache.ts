import { LRUCache } from 'lru-cache';

export class LazyCache<K extends {}, V extends {}> {
  private readonly cache: LRUCache<K, V>;

  constructor(options: LRUCache.Options<K, V, unknown>) {
    this.cache = new LRUCache<K, V>(options);
  }

  get(key: K, callback: () => V): V {
    if (!this.cache.has(key)) {
      this.cache.set(key, callback());
    }
    return this.cache.get(key)!;
  }

  set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}
