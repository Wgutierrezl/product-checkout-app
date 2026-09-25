import { withConcurrencyLimit } from './with-concurrency-limit';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('withConcurrencyLimit', () => {
  it('returns an empty array for an empty input, calling the mapper zero times', async () => {
    const mapper = jest.fn();

    const result = await withConcurrencyLimit([], 5, mapper);

    expect(result).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  it('maps every item and preserves result order regardless of completion order', async () => {
    const result = await withConcurrencyLimit([1, 2, 3, 4], 2, async (item) => {
      // Reverse-order artificial delay: item 1 finishes LAST, item 4 finishes FIRST.
      await new Promise((resolve) => setTimeout(resolve, (5 - item) * 5));
      return item * 10;
    });

    expect(result).toEqual([10, 20, 30, 40]);
  });

  it('never runs more than `concurrency` mappers at once', async () => {
    const items = Array.from({ length: 8 }, (_, i) => i);
    let inFlight = 0;
    let maxObservedInFlight = 0;

    await withConcurrencyLimit(items, 3, async (item) => {
      inFlight += 1;
      maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item;
    });

    expect(maxObservedInFlight).toBeLessThanOrEqual(3);
    expect(maxObservedInFlight).toBeGreaterThan(1);
  });

  it('runs strictly sequentially when concurrency is 1', async () => {
    const order: number[] = [];

    await withConcurrencyLimit([1, 2, 3], 1, async (item) => {
      order.push(item);
      await new Promise((resolve) => setTimeout(resolve, 1));
      return item;
    });

    expect(order).toEqual([1, 2, 3]);
  });

  it('caps effective concurrency at the item count when concurrency exceeds it', async () => {
    const { promise, resolve } = deferred<void>();
    let started = 0;

    const runPromise = withConcurrencyLimit([1, 2], 10, async (item) => {
      started += 1;
      await promise;
      return item;
    });

    // Give both workers a microtask tick to start before resolving.
    await new Promise((r) => setTimeout(r, 5));
    expect(started).toBe(2);
    resolve();
    await runPromise;
  });

  it('propagates a mapper rejection', async () => {
    await expect(
      withConcurrencyLimit([1, 2, 3], 2, async (item) => {
        if (item === 2) {
          throw new Error('boom');
        }
        return item;
      }),
    ).rejects.toThrow('boom');
  });
});
