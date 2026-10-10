import { Observable, takeUntil } from 'rxjs';

/** Unsubscribe the source and reject pending work when the caller cancels it. */
export function abortable<T>(
  source: Observable<T>,
  signal?: AbortSignal,
): Observable<T> {
  if (!signal) return source;
  const aborted = new Observable<never>(subscriber => {
    const onAbort = (): void =>
      subscriber.error(signal.reason ?? new Error('operation aborted'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    return (): void => signal.removeEventListener('abort', onAbort);
  });
  return source.pipe(takeUntil(aborted));
}

export function waitFor<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void =>
      reject(signal.reason ?? new Error('operation aborted'));
    const clean = (): void => signal.removeEventListener('abort', onAbort);
    promise.then(
      value => {
        clean();
        resolve(value);
      },
      error => {
        clean();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}
