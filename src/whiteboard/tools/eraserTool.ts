import { hitTestTopObjectId } from "../hitTest";
import { WHITEBOARD_OPS } from "../ops";
import type { ToolContext, WhiteboardTool } from "./toolTypes";

export function createEraserTool(): WhiteboardTool {
  return {
    name: "eraser",
    onPointerDown(point, context: ToolContext) {
      const scene = context.getScene();
      const hitId = hitTestTopObjectId(scene, point);
      if (!hitId) return;

      // Delete whichever top-most object is hit (stroke/shape/text).
      context.submitOp({
        opType: WHITEBOARD_OPS.STROKE_DELETE,
        payload: { id: hitId },
      });
    },
    onPointerMove() {},
    onPointerUp() {},
    cancel(context) {
      context.setLivePreview(null);
    },
  };
}
