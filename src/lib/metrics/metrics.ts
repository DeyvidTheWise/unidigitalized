type Labels = Record<string, string>;

type TimerAggregate = {
  count: number;
  sum: number;
  min: number;
  max: number;
};

const counters = new Map<string, number>();
const timers = new Map<string, TimerAggregate>();

function key(name: string, labels?: Labels): string {
  if (!labels || Object.keys(labels).length === 0) {
    return name;
  }

  const stable = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");

  return `${name}{${stable}}`;
}

export function inc(name: string, labels?: Labels, value = 1): void {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + value);
}

export function observe(name: string, value: number, labels?: Labels): void {
  const k = key(name, labels);
  const current = timers.get(k);
  if (!current) {
    timers.set(k, { count: 1, sum: value, min: value, max: value });
    return;
  }

  current.count += 1;
  current.sum += value;
  current.min = Math.min(current.min, value);
  current.max = Math.max(current.max, value);
}

export function snapshot() {
  const counterObj: Record<string, number> = {};
  for (const [k, v] of counters.entries()) {
    counterObj[k] = v;
  }

  const timerObj: Record<string, TimerAggregate & { avg: number }> = {};
  for (const [k, v] of timers.entries()) {
    timerObj[k] = {
      ...v,
      avg: v.count > 0 ? Number((v.sum / v.count).toFixed(3)) : 0,
    };
  }

  return {
    time: new Date().toISOString(),
    counters: counterObj,
    timers: timerObj,
  };
}
