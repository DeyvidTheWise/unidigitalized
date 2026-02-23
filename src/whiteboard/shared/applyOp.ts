import type { ObjectUnion, SceneState, Shape, Stroke, TextObject } from "../model";
import { WHITEBOARD_OPS, type ObjectMovePayload, type WhiteboardOpType } from "../ops";

function withObject(state: SceneState, objectValue: ObjectUnion): SceneState {
  const nextObjects = new Map(state.objectsById);
  nextObjects.set(objectValue.id, objectValue);

  const hasInZ = state.zOrder.includes(objectValue.id);
  const nextZ = hasInZ ? state.zOrder : [...state.zOrder, objectValue.id];

  return {
    ...state,
    objectsById: nextObjects,
    zOrder: nextZ,
  };
}

function deleteObject(state: SceneState, id: string): SceneState {
  if (!state.objectsById.has(id)) {
    return state;
  }

  const nextObjects = new Map(state.objectsById);
  nextObjects.delete(id);

  return {
    ...state,
    objectsById: nextObjects,
    zOrder: state.zOrder.filter((item) => item !== id),
  };
}

function moveObject(objectValue: ObjectUnion, payload: ObjectMovePayload): ObjectUnion {
  if (objectValue.objectType === "stroke") {
    const moved: Stroke = {
      ...objectValue,
      points: objectValue.points.map((point) => ({ ...point, x: point.x + payload.dx, y: point.y + payload.dy })),
    };
    return moved;
  }

  if (objectValue.objectType === "shape") {
    const moved: Shape = {
      ...objectValue,
      x1: objectValue.x1 + payload.dx,
      y1: objectValue.y1 + payload.dy,
      x2: objectValue.x2 + payload.dx,
      y2: objectValue.y2 + payload.dy,
    };
    return moved;
  }

  const moved: TextObject = {
    ...objectValue,
    x: objectValue.x + payload.dx,
    y: objectValue.y + payload.dy,
  };
  return moved;
}

export function applyOpShared(state: SceneState, opType: string, payload: unknown): SceneState {
  switch (opType as WhiteboardOpType) {
    case WHITEBOARD_OPS.STROKE_ADD: {
      const stroke = (payload as { stroke?: ObjectUnion })?.stroke;
      if (!stroke || stroke.objectType !== "stroke") return state;
      return withObject(state, stroke);
    }

    case WHITEBOARD_OPS.STROKE_DELETE: {
      const id = (payload as { id?: string })?.id;
      if (!id) return state;
      return deleteObject(state, id);
    }

    case WHITEBOARD_OPS.SHAPE_ADD: {
      const shape = (payload as { shape?: ObjectUnion })?.shape;
      if (!shape || shape.objectType !== "shape") return state;
      return withObject(state, shape);
    }

    case WHITEBOARD_OPS.SHAPE_UPDATE: {
      const id = (payload as { id?: string })?.id;
      const patch = (payload as { patch?: Partial<Shape> })?.patch;
      if (!id || !patch) return state;

      const existing = state.objectsById.get(id);
      if (!existing || existing.objectType !== "shape") return state;

      const nextShape: Shape = {
        ...existing,
        ...patch,
      };
      return withObject(state, nextShape);
    }

    case WHITEBOARD_OPS.TEXT_ADD: {
      const textObj = (payload as { textObj?: ObjectUnion })?.textObj;
      if (!textObj || textObj.objectType !== "text") return state;
      return withObject(state, textObj);
    }

    case WHITEBOARD_OPS.TEXT_UPDATE: {
      const id = (payload as { id?: string })?.id;
      const patch = (payload as { patch?: Partial<TextObject> })?.patch;
      if (!id || !patch) return state;

      const existing = state.objectsById.get(id);
      if (!existing || existing.objectType !== "text") return state;

      const nextText: TextObject = {
        ...existing,
        ...patch,
      };
      return withObject(state, nextText);
    }

    case WHITEBOARD_OPS.OBJECT_MOVE: {
      const movePayload = payload as ObjectMovePayload;
      if (!movePayload || typeof movePayload.id !== "string") return state;

      const existing = state.objectsById.get(movePayload.id);
      if (!existing) return state;

      return withObject(state, moveObject(existing, movePayload));
    }

    case WHITEBOARD_OPS.ZORDER_SET: {
      const order = (payload as { zOrder?: string[] })?.zOrder;
      if (!Array.isArray(order)) return state;

      const dedup = Array.from(new Set(order)).filter((id) => state.objectsById.has(id));
      for (const id of state.zOrder) {
        if (!dedup.includes(id) && state.objectsById.has(id)) {
          dedup.push(id);
        }
      }

      return {
        ...state,
        zOrder: dedup,
      };
    }

    default:
      return state;
  }
}
