import { hitTestTopObjectId } from "../hitTest";
import { WHITEBOARD_OPS } from "../ops";
import type { PointerInfo, ToolContext, WhiteboardTool } from "./toolTypes";
import { moveObject } from "./toolTypes";

export function createSelectMoveTool(): WhiteboardTool {
  let selectedId: string | null = null;
  let startPoint: PointerInfo | null = null;
  let lastPoint: PointerInfo | null = null;

  return {
    name: "select",
    onPointerDown(point, context) {
      const scene = context.getScene();
      selectedId = hitTestTopObjectId(scene, point);
      startPoint = point;
      lastPoint = point;

      if (selectedId) {
        const objectValue = scene.objectsById.get(selectedId);
        if (objectValue) {
          context.setLivePreview({ kind: "selection", object: objectValue });
        }
      }
    },
    onPointerMove(point, context) {
      if (!selectedId || !startPoint) return;

      lastPoint = point;
      const scene = context.getScene();
      const objectValue = scene.objectsById.get(selectedId);
      if (!objectValue) return;

      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      const moved = moveObject(objectValue, dx, dy);
      context.setLivePreview({ kind: "selection", object: moved });
    },
    onPointerUp(_point, context) {
      if (!selectedId || !startPoint || !lastPoint) {
        context.setLivePreview(null);
        selectedId = null;
        startPoint = null;
        lastPoint = null;
        return;
      }

      const dx = lastPoint.x - startPoint.x;
      const dy = lastPoint.y - startPoint.y;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        context.submitOp({
          opType: WHITEBOARD_OPS.OBJECT_MOVE,
          payload: { id: selectedId, dx, dy },
        });
      }

      context.setLivePreview(null);
      selectedId = null;
      startPoint = null;
      lastPoint = null;
    },
    cancel(context) {
      selectedId = null;
      startPoint = null;
      lastPoint = null;
      context.setLivePreview(null);
    },
  };
}
