import { Observable } from 'rxjs';

export function toPromise<T>(observable: Observable<T>): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const values: T[] = [];
    observable.subscribe({
      next: value => values.push(value),
      error: reject,
      complete: () => resolve(values),
    });
  });
}
