import { createCanvas } from "canvas";
import type { ObjectUnion, SceneState, Shape, Stroke, TextObject } from "../whiteboard/model";

type RenderOptions = {
  width?: number;
  height?: number;
  background?: string;
};

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0) return;

  const color = stroke.style.color ?? (stroke.style.tool === "highlighter" ? "#facc15" : "#111827");
  ctx.save();
  ctx.globalAlpha = stroke.style.opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = stroke.style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  const minX = Math.min(shape.x1, shape.x2);
  const minY = Math.min(shape.y1, shape.y2);
  const width = Math.abs(shape.x2 - shape.x1);
  const height = Math.abs(shape.y2 - shape.y1);

  ctx.save();
  ctx.globalAlpha = shape.style.opacity;
  ctx.strokeStyle = shape.style.color;
  ctx.lineWidth = shape.style.width;

  if (shape.kind === "rect") {
    if (shape.style.fill) {
      ctx.fillStyle = shape.style.fill;
      ctx.fillRect(minX, minY, width, height);
    }
    ctx.strokeRect(minX, minY, width, height);
  }

  if (shape.kind === "ellipse") {
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, width / 2, height / 2, 0, 0, Math.PI * 2);
    if (shape.style.fill) {
      ctx.fillStyle = shape.style.fill;
      ctx.fill();
    }
    ctx.stroke();
  }

  if (shape.kind === "line") {
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, textObj: TextObject): void {
  ctx.save();
  ctx.fillStyle = textObj.color;
  ctx.font = `${textObj.fontSize}px sans-serif`;
  ctx.fillText(textObj.text, textObj.x, textObj.y);
  ctx.restore();
}

function drawObject(ctx: CanvasRenderingContext2D, objectValue: ObjectUnion): void {
  if (objectValue.objectType === "stroke") {
    drawStroke(ctx, objectValue);
    return;
  }
  if (objectValue.objectType === "shape") {
    drawShape(ctx, objectValue);
    return;
  }
  drawText(ctx, objectValue);
}

export function renderBoardToPng(
  state: SceneState,
  options?: RenderOptions,
): { pngBuffer: Buffer; width: number; height: number } {
  const width = options?.width ?? DEFAULT_WIDTH;
  const height = options?.height ?? DEFAULT_HEIGHT;
  const background = options?.background ?? "#ffffff";

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  for (const id of state.zOrder) {
    const objectValue = state.objectsById.get(id);
    if (objectValue) {
      drawObject(ctx as unknown as CanvasRenderingContext2D, objectValue);
    }
  }

  const pngBuffer = canvas.toBuffer("image/png");
  return { pngBuffer, width, height };
}
