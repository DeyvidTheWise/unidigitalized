import type { Shape } from "../model";
import { WHITEBOARD_OPS } from "../ops";
import { createShapePreview } from "../renderer";
import type { PointerInfo, ToolContext, WhiteboardTool } from "./toolTypes";

export type ShapeKind = "rect" | "ellipse" | "line";

export function createShapeTool(kind: ShapeKind): WhiteboardTool {
  let dragStart: PointerInfo | null = null;
  let latestPoint: PointerInfo | null = null;

  const baseStyle: Shape["style"] = {
    width: 2,
    opacity: 1,
    color: "#111827",
    fill: kind === "line" ? undefined : "rgba(59,130,246,0.08)",
  };

  function buildShape(context: ToolContext): Shape | null {
    if (!dragStart || !latestPoint) {
      return null;
    }

    return {
      objectType: "shape",
      id: crypto.randomUUID(),
      kind,
      x1: dragStart.x,
      y1: dragStart.y,
      x2: latestPoint.x,
      y2: latestPoint.y,
      style: baseStyle,
      createdBy: context.userId,
    };
  }

  return {
    name: "shape",
    onPointerDown(point, context) {
      dragStart = point;
      latestPoint = point;
      const shape = buildShape(context);
      if (shape) {
        context.setLivePreview(createShapePreview(shape));
      }
    },
    onPointerMove(point, context) {
      if (!dragStart) return;
      latestPoint = point;
      const shape = buildShape(context);
      if (shape) {
        context.setLivePreview(createShapePreview(shape));
      }
    },
    onPointerUp(point, context) {
      if (!dragStart) return;
      latestPoint = point;
      const shape = buildShape(context);
      if (shape) {
        context.submitOp({
          opType: WHITEBOARD_OPS.SHAPE_ADD,
          payload: { shape: { ...shape, createdBy: context.userId } },
        });
      }

      dragStart = null;
      latestPoint = null;
      context.setLivePreview(null);
    },
    cancel(context) {
      dragStart = null;
      latestPoint = null;
      context.setLivePreview(null);
    },
  };
}
