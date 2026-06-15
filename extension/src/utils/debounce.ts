/**
 * utils/debounce.ts — Debounce utility for tab event handling
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };
}

/**
 * Service-worker-safe debounce using chrome.alarms instead of setTimeout.
 * The SW may be killed between the timeout firing and the callback running.
 * Use this for sync triggers that must survive SW suspension.
 */
export function scheduleAlarmDebounce(
  alarmName: string,
  delayMinutes: number = 1,
): void {
  // Clear existing alarm and re-schedule (effectively a debounce)
  chrome.alarms.clear(alarmName, () => {
    chrome.alarms.create(alarmName, { delayInMinutes: delayMinutes });
  });
}
