// OrnaVerse's database sits behind a 10-connection pool; never fire a list of its calls all at once.

/** Like Promise.all(items.map(worker)), but at most `limit` workers run at a time. Results keep input order. */
export async function mapWithConcurrency(items, worker, limit = 3) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/** Wraps tasks so at most `limit` run at a time: `const limited = createLimiter(3); limited(() => fetch(...))`. */
export function createLimiter(limit = 3) {
  const queue = [];
  let active = 0;
  const pump = () => {
    while (active < limit && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active--;
        pump();
      });
    }
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}
