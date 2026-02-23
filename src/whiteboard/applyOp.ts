import { applyOpShared } from "./shared/applyOp";
import type { SceneState } from "./model";

export function applyOp(state: SceneState, opType: string, payload: unknown): SceneState {
  const next = applyOpShared(state, opType, payload);

  if (next === state && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("Unknown or invalid whiteboard op ignored", opType, payload);
  }

  return next;
}
