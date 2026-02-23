import { WHITEBOARD_OPS } from "../ops";
import type { TextObject } from "../model";
import type { ToolContext, WhiteboardTool } from "./toolTypes";

export function createTextTool(): WhiteboardTool {
  return {
    name: "text",
    onPointerDown(point, context) {
      context.requestTextInput(point, (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        const textObj: TextObject = {
          objectType: "text",
          id: crypto.randomUUID(),
          x: point.x,
          y: point.y,
          text: trimmed,
          fontSize: 20,
          color: "#111827",
          createdBy: context.userId,
        };

        context.submitOp({
          opType: WHITEBOARD_OPS.TEXT_ADD,
          payload: { textObj },
        });
      });
    },
    onPointerMove() {},
    onPointerUp() {},
    cancel(context) {
      context.setLivePreview(null);
    },
  };
}
