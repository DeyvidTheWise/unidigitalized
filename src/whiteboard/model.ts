export type Point = {
  x: number;
  y: number;
  t?: number;
};

export type StrokeStyle = {
  width: number;
  opacity: number;
  tool: "pen" | "highlighter";
  color?: string;
};

export type ShapeStyle = {
  width: number;
  opacity: number;
  color: string;
  fill?: string;
};

export type Stroke = {
  objectType: "stroke";
  id: string;
  points: Point[];
  style: StrokeStyle;
  createdBy: string;
  createdAt: string;
};

export type Shape = {
  objectType: "shape";
  id: string;
  kind: "rect" | "ellipse" | "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: ShapeStyle;
  createdBy: string;
};

export type TextObject = {
  objectType: "text";
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  createdBy: string;
};

export type ObjectUnion = Stroke | Shape | TextObject;

export type SceneState = {
  objectsById: Map<string, ObjectUnion>;
  zOrder: string[];
  version: {
    lastServerSeq: number;
  };
};

export type SerializableSceneState = {
  objectsById: Record<string, ObjectUnion>;
  zOrder: string[];
  version: {
    lastServerSeq: number;
  };
};

export function createEmptySceneState(): SceneState {
  return {
    objectsById: new Map(),
    zOrder: [],
    version: { lastServerSeq: 0 },
  };
}

export function sceneToSerializable(state: SceneState): SerializableSceneState {
  const objectsById: Record<string, ObjectUnion> = {};
  for (const [id, objectValue] of state.objectsById.entries()) {
    objectsById[id] = objectValue;
  }

  return {
    objectsById,
    zOrder: [...state.zOrder],
    version: { ...state.version },
  };
}

function isStroke(value: unknown): value is Stroke {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.objectType === "stroke" &&
    typeof v.id === "string" &&
    Array.isArray(v.points) &&
    typeof v.createdBy === "string" &&
    typeof v.createdAt === "string"
  );
}

function isShape(value: unknown): value is Shape {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.objectType === "shape" &&
    typeof v.id === "string" &&
    (v.kind === "rect" || v.kind === "ellipse" || v.kind === "line") &&
    typeof v.x1 === "number" &&
    typeof v.y1 === "number" &&
    typeof v.x2 === "number" &&
    typeof v.y2 === "number" &&
    typeof v.createdBy === "string"
  );
}

function isTextObject(value: unknown): value is TextObject {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.objectType === "text" &&
    typeof v.id === "string" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.text === "string" &&
    typeof v.fontSize === "number" &&
    typeof v.color === "string" &&
    typeof v.createdBy === "string"
  );
}

export function sceneFromUnknown(value: unknown): SceneState {
  if (!value || typeof value !== "object") {
    return createEmptySceneState();
  }

  const candidate = value as Partial<SerializableSceneState>;
  if (!candidate.objectsById || typeof candidate.objectsById !== "object") {
    return createEmptySceneState();
  }

  const objectsById = new Map<string, ObjectUnion>();
  for (const [id, obj] of Object.entries(candidate.objectsById)) {
    if (isStroke(obj) || isShape(obj) || isTextObject(obj)) {
      objectsById.set(id, obj);
    }
  }

  const zOrder = Array.isArray(candidate.zOrder)
    ? candidate.zOrder.filter((id): id is string => typeof id === "string")
    : [];

  const lastServerSeq =
    typeof candidate.version?.lastServerSeq === "number" && Number.isFinite(candidate.version.lastServerSeq)
      ? candidate.version.lastServerSeq
      : 0;

  return {
    objectsById,
    zOrder,
    version: { lastServerSeq },
  };
}
