import type { ObjectUnion, Point, SceneState, Shape, Stroke, TextObject } from "./model";

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function distancePointToSegment(point: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq === 0) {
    const dx = point.x - a.x;
    const dy = point.y - a.y;
    return Math.hypot(dx, dy);
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

export function boundsForStroke(stroke: Stroke): Bounds {
  if (stroke.points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = stroke.points[0].x;
  let minY = stroke.points[0].y;
  let maxX = stroke.points[0].x;
  let maxY = stroke.points[0].y;

  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const pad = Math.max(2, stroke.style.width);
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function boundsForShape(shape: Shape): Bounds {
  const minX = Math.min(shape.x1, shape.x2);
  const minY = Math.min(shape.y1, shape.y2);
  const maxX = Math.max(shape.x1, shape.x2);
  const maxY = Math.max(shape.y1, shape.y2);
  const pad = Math.max(2, shape.style.width);
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function boundsForText(textObject: TextObject): Bounds {
  const width = Math.max(textObject.text.length * textObject.fontSize * 0.6, textObject.fontSize * 0.8);
  return {
    minX: textObject.x,
    minY: textObject.y - textObject.fontSize,
    maxX: textObject.x + width,
    maxY: textObject.y + 4,
  };
}

export function pointInRect(point: Point, bounds: Bounds): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

export function hitTestStroke(point: Point, stroke: Stroke): boolean {
  if (!pointInRect(point, boundsForStroke(stroke))) {
    return false;
  }

  const threshold = Math.max(6, stroke.style.width + 2);
  for (let i = 0; i < stroke.points.length - 1; i += 1) {
    if (distancePointToSegment(point, stroke.points[i], stroke.points[i + 1]) <= threshold) {
      return true;
    }
  }

  return false;
}

export function hitTestObject(point: Point, objectValue: ObjectUnion): boolean {
  if (objectValue.objectType === "stroke") {
    return hitTestStroke(point, objectValue);
  }

  if (objectValue.objectType === "shape") {
    return pointInRect(point, boundsForShape(objectValue));
  }

  return pointInRect(point, boundsForText(objectValue));
}

export function hitTestTopObjectId(state: SceneState, point: Point): string | null {
  for (let i = state.zOrder.length - 1; i >= 0; i -= 1) {
    const id = state.zOrder[i];
    const objectValue = state.objectsById.get(id);
    if (objectValue && hitTestObject(point, objectValue)) {
      return id;
    }
  }

  return null;
}
