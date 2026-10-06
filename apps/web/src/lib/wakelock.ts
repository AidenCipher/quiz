/** Keep the screen on during a game (also avoids false "tab hidden" flags from auto-lock). */

let sentinel: WakeLockSentinel | null = null;
export async function acquireWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator && !sentinel) {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => (sentinel = null));
    }
  } catch {
    /* denied or unsupported */
  }
}
export function releaseWakeLock(): void {
  void sentinel?.release();
  sentinel = null;
}
