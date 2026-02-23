import type { ObjectUnion, Point, SceneState, Shape, Stroke, TextObject } from "../model";
import type { PreviewPrimitive } from "../renderer";
import type { WhiteboardOpType } from "../ops";

export type ToolName = "pen" | "highlighter" | "eraser" | "shape" | "select" | "text";

export type PointerInfo = Point;

export type ToolCommitOp = {
  opType: WhiteboardOpType;
  payload: unknown;
};

export type ToolContext = {
  userId: string;
  getScene: () => SceneState;
  submitOp: (op: ToolCommitOp) => void;
  setLivePreview: (preview: PreviewPrimitive | null) => void;
  requestTextInput: (point: Point, onCommit: (text: string) => void) => void;
};

export type WhiteboardTool = {
  name: ToolName;
  onPointerDown: (point: PointerInfo, context: ToolContext) => void;
  onPointerMove: (point: PointerInfo, context: ToolContext) => void;
  onPointerUp: (point: PointerInfo, context: ToolContext) => void;
  cancel: (context: ToolContext) => void;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeStrokeId(): string {
  return crypto.randomUUID();
}

export function moveObject(objectValue: ObjectUnion, dx: number, dy: number): ObjectUnion {
  if (objectValue.objectType === "stroke") {
    const moved: Stroke = {
      ...objectValue,
      points: objectValue.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
    };
    return moved;
  }

  if (objectValue.objectType === "shape") {
    const moved: Shape = {
      ...objectValue,
      x1: objectValue.x1 + dx,
      y1: objectValue.y1 + dy,
      x2: objectValue.x2 + dx,
      y2: objectValue.y2 + dy,
    };
    return moved;
  }

  const moved: TextObject = {
    ...objectValue,
    x: objectValue.x + dx,
    y: objectValue.y + dy,
  };
  return moved;
}
