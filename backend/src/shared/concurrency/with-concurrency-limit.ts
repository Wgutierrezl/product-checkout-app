/**
 * Runs `mapper` over `items` with at most `concurrency` in flight at once,
 * preserving result order regardless of completion order. Used to bound the
 * number of concurrent I/O calls (e.g. DynamoDB reads) a single fan-out
 * request triggers, instead of firing one per item regardless of list size
 * (see `ListMyTransactionsUseCase`'s delivery lookups).
 *
 * A plain, dependency-free worker-pool implementation: `workerCount` workers
 * each pull the next unclaimed index off a shared cursor until none remain.
 */
export function withConcurrencyLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => PromiseLike<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, () => worker());
  return Promise.all(workers).then(() => results);
}
