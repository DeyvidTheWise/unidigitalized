import type { ObjectUnion, Point, SceneState, Shape, Stroke, TextObject } from "./model";

export type PreviewPrimitive =
  | { kind: "stroke"; stroke: Stroke }
  | { kind: "shape"; shape: Shape }
  | { kind: "text"; text: TextObject }
  | { kind: "selection"; object: ObjectUnion };

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
    const centerX = (shape.x1 + shape.x2) / 2;
    const centerY = (shape.y1 + shape.y2) / 2;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
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

function drawText(ctx: CanvasRenderingContext2D, textObject: TextObject): void {
  ctx.save();
  ctx.fillStyle = textObject.color;
  ctx.font = `${textObject.fontSize}px sans-serif`;
  ctx.fillText(textObject.text, textObject.x, textObject.y);
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

function drawPreview(ctx: CanvasRenderingContext2D, preview: PreviewPrimitive | null): void {
  if (!preview) return;

  if (preview.kind === "stroke") {
    drawStroke(ctx, preview.stroke);
    return;
  }

  if (preview.kind === "shape") {
    drawShape(ctx, preview.shape);
    return;
  }

  if (preview.kind === "text") {
    drawText(ctx, preview.text);
    return;
  }

  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 1;

  if (preview.object.objectType === "stroke") {
    const points = preview.object.points;
    if (points.length > 0) {
      let minX = points[0].x;
      let maxX = points[0].x;
      let minY = points[0].y;
      let maxY = points[0].y;
      for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
      ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
    }
  } else if (preview.object.objectType === "shape") {
    const minX = Math.min(preview.object.x1, preview.object.x2);
    const minY = Math.min(preview.object.y1, preview.object.y2);
    const width = Math.abs(preview.object.x2 - preview.object.x1);
    const height = Math.abs(preview.object.y2 - preview.object.y1);
    ctx.strokeRect(minX - 4, minY - 4, width + 8, height + 8);
  } else {
    const metricsWidth = Math.max(preview.object.text.length * (preview.object.fontSize * 0.6), 24);
    ctx.strokeRect(preview.object.x - 4, preview.object.y - preview.object.fontSize, metricsWidth + 8, preview.object.fontSize + 8);
  }

  ctx.restore();
}

export class WhiteboardRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private committedCanvas: HTMLCanvasElement | null = null;
  private committedCtx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private width = 1;
  private height = 1;

  private committedState: SceneState | null = null;
  private livePreview: PreviewPrimitive | null = null;

  private committedDirty = true;
  private framePending = false;

  init(canvas: HTMLCanvasElement, state: SceneState): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.committedCanvas = document.createElement("canvas");
    this.committedCtx = this.committedCanvas.getContext("2d");
    this.committedState = state;

    this.resize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.ctx || !this.committedCanvas || !this.committedCtx) {
      return;
    }

    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    const scaledWidth = Math.floor(this.width * this.dpr);
    const scaledHeight = Math.floor(this.height * this.dpr);

    this.canvas.width = scaledWidth;
    this.canvas.height = scaledHeight;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.committedCanvas.width = scaledWidth;
    this.committedCanvas.height = scaledHeight;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.committedCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.committedDirty = true;
    this.scheduleRender();
  }

  setCommittedState(state: SceneState): void {
    this.committedState = state;
    this.committedDirty = true;
    this.scheduleRender();
  }

  setLivePreview(preview: PreviewPrimitive | null): void {
    this.livePreview = preview;
    this.scheduleRender();
  }

  private redrawCommittedLayer(): void {
    if (!this.committedCtx || !this.committedState) return;

    this.committedCtx.clearRect(0, 0, this.width, this.height);

    for (const id of this.committedState.zOrder) {
      const objectValue = this.committedState.objectsById.get(id);
      if (objectValue) {
        drawObject(this.committedCtx, objectValue);
      }
    }

    this.committedDirty = false;
  }

  private renderNow = (): void => {
    this.framePending = false;
    if (!this.canvas || !this.ctx || !this.committedCanvas) return;

    if (this.committedDirty) {
      this.redrawCommittedLayer();
    }

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.drawImage(this.committedCanvas, 0, 0, this.width, this.height);
    drawPreview(this.ctx, this.livePreview);
  };

  private scheduleRender(): void {
    if (this.framePending) return;
    this.framePending = true;
    requestAnimationFrame(this.renderNow);
  }
}

export function createStrokePreview(points: Point[], style: Stroke["style"], createdBy: string): PreviewPrimitive {
  return {
    kind: "stroke",
    stroke: {
      objectType: "stroke",
      id: "preview-stroke",
      points,
      style,
      createdBy,
      createdAt: new Date().toISOString(),
    },
  };
}

export function createShapePreview(shape: Shape): PreviewPrimitive {
  return {
    kind: "shape",
    shape,
  };
}
