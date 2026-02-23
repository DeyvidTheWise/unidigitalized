import type { PointerInfo, ToolContext, WhiteboardTool } from "./toolTypes";
import type { Stroke } from "../model";
import { WHITEBOARD_OPS } from "../ops";
import { createStrokePreview } from "../renderer";
import { makeStrokeId, nowIso } from "./toolTypes";

const MIN_POINT_DISTANCE = 2;

export function createHighlighterTool(): WhiteboardTool {
  let drawing = false;
  let points: PointerInfo[] = [];

  const style: Stroke["style"] = {
    width: 10,
    opacity: 0.25,
    tool: "highlighter",
    color: "#facc15",
  };

  function addPoint(point: PointerInfo): void {
    const last = points[points.length - 1];
    if (!last) {
      points.push(point);
      return;
    }

    if (Math.hypot(point.x - last.x, point.y - last.y) >= MIN_POINT_DISTANCE) {
      points.push(point);
    }
  }

  return {
    name: "highlighter",
    onPointerDown(point, context) {
      drawing = true;
      points = [point];
      context.setLivePreview(createStrokePreview(points, style, context.userId));
    },
    onPointerMove(point, context) {
      if (!drawing) return;
      addPoint(point);
      context.setLivePreview(createStrokePreview(points, style, context.userId));
    },
    onPointerUp(point, context) {
      if (!drawing) return;
      addPoint(point);

      if (points.length > 1) {
        const stroke: Stroke = {
          objectType: "stroke",
          id: makeStrokeId(),
          points: [...points],
          style,
          createdBy: context.userId,
          createdAt: nowIso(),
        };

        context.submitOp({
          opType: WHITEBOARD_OPS.STROKE_ADD,
          payload: { stroke },
        });
      }

      drawing = false;
      points = [];
      context.setLivePreview(null);
    },
    cancel(context) {
      drawing = false;
      points = [];
      context.setLivePreview(null);
    },
  };
}
