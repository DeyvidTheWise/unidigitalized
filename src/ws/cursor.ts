import type { SocketMeta } from "./rooms";

const CURSOR_THROTTLE_MS = 50;

export function shouldBroadcastCursor(meta: SocketMeta): boolean {
  const now = Date.now();
  if (now - meta.lastCursorTs < CURSOR_THROTTLE_MS) {
    return false;
  }

  meta.lastCursorTs = now;
  return true;
}
