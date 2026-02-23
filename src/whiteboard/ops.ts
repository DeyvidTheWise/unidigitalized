import type { Shape, Stroke, TextObject } from "./model";

export const WHITEBOARD_OPS = {
  STROKE_ADD: "STROKE_ADD",
  STROKE_DELETE: "STROKE_DELETE",
  SHAPE_ADD: "SHAPE_ADD",
  SHAPE_UPDATE: "SHAPE_UPDATE",
  TEXT_ADD: "TEXT_ADD",
  TEXT_UPDATE: "TEXT_UPDATE",
  OBJECT_MOVE: "OBJECT_MOVE",
  ZORDER_SET: "ZORDER_SET",
} as const;

export type WhiteboardOpType = (typeof WHITEBOARD_OPS)[keyof typeof WHITEBOARD_OPS];

export type StrokeAddPayload = { stroke: Stroke };
export type StrokeDeletePayload = { id: string };
export type ShapeAddPayload = { shape: Shape };
export type ShapeUpdatePayload = {
  id: string;
  patch: Partial<Pick<Shape, "x1" | "y1" | "x2" | "y2" | "style">>;
};
export type TextAddPayload = { textObj: TextObject };
export type TextUpdatePayload = {
  id: string;
  patch: Partial<Pick<TextObject, "x" | "y" | "text" | "fontSize" | "color">>;
};
export type ObjectMovePayload = { id: string; dx: number; dy: number };
export type ZOrderSetPayload = { zOrder: string[] };

export type WhiteboardPayloadMap = {
  STROKE_ADD: StrokeAddPayload;
  STROKE_DELETE: StrokeDeletePayload;
  SHAPE_ADD: ShapeAddPayload;
  SHAPE_UPDATE: ShapeUpdatePayload;
  TEXT_ADD: TextAddPayload;
  TEXT_UPDATE: TextUpdatePayload;
  OBJECT_MOVE: ObjectMovePayload;
  ZORDER_SET: ZOrderSetPayload;
};

export type AnyWhiteboardPayload = WhiteboardPayloadMap[keyof WhiteboardPayloadMap];
