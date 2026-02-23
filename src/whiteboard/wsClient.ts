import type { SerializableSceneState } from "./model";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export type WelcomeMessage = {
  type: "WELCOME";
  userId: string;
  sessionId: string;
  presence: Array<{ userId: string }>;
  lastServerSeq: number;
  stateSnapshot: SerializableSceneState | null;
  ops: Array<{
    serverSeq: number;
    actorUserId: string;
    opType: string;
    payload: unknown;
    createdAt: string;
  }>;
  truncated: boolean;
};

export type BroadcastMessage = {
  type: "OP_BROADCAST";
  serverSeq: number;
  actorUserId: string;
  opType: string;
  payload: unknown;
  createdAt: string;
};

export type PresenceMessage = {
  type: "PRESENCE";
  sessionId: string;
  users: Array<{ userId: string }>;
};

export type CursorMessage = {
  type: "CURSOR_BROADCAST";
  sessionId: string;
  userId: string;
  x: number;
  y: number;
};

export type RejectMessage = {
  type: "OP_REJECTED";
  clientOpId: string;
  code: string;
  message: string;
};

export type WhiteboardWsHandlers = {
  onStatus?: (status: ConnectionStatus) => void;
  onWelcome?: (message: WelcomeMessage) => void;
  onBroadcast?: (message: BroadcastMessage) => void;
  onPresence?: (message: PresenceMessage) => void;
  onCursor?: (message: CursorMessage) => void;
  onRejected?: (message: RejectMessage) => void;
};

function wsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
}

export class WhiteboardWsClient {
  private sessionId: string;
  private handlers: WhiteboardWsHandlers;

  private socket: WebSocket | null = null;
  private closedByUser = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;

  private lastServerSeq = 0;
  private queuedBroadcasts = new Map<number, BroadcastMessage>();
  private pendingOps = new Map<string, { opType: string }>();

  private lastCursorSentAt = 0;

  constructor(sessionId: string, handlers: WhiteboardWsHandlers) {
    this.sessionId = sessionId;
    this.handlers = handlers;
  }

  connect(): void {
    this.closedByUser = false;
    this.handlers.onStatus?.(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    const socket = new WebSocket(wsUrl());
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.handlers.onStatus?.("connected");
      this.sendRaw({
        type: "HELLO",
        sessionId: this.sessionId,
      });
    };

    socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    socket.onclose = () => {
      this.socket = null;
      if (!this.closedByUser) {
        this.scheduleReconnect();
      } else {
        this.handlers.onStatus?.("offline");
      }
    };

    socket.onerror = () => {
      // rely on close for reconnect flow
    };
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, "client_disconnect");
    }

    this.socket = null;
    this.handlers.onStatus?.("offline");
  }

  submitOp(opType: string, payload: unknown): string | null {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return null;
    }

    const clientOpId = crypto.randomUUID();
    this.pendingOps.set(clientOpId, { opType });

    this.sendRaw({
      type: "OP_SUBMIT",
      sessionId: this.sessionId,
      clientOpId,
      opType,
      payload,
    });

    return clientOpId;
  }

  sendCursor(x: number, y: number): void {
    const now = Date.now();
    if (now - this.lastCursorSentAt < 50) {
      return;
    }

    this.lastCursorSentAt = now;

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.sendRaw({
      type: "CURSOR",
      sessionId: this.sessionId,
      x,
      y,
    });
  }

  private sendRaw(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delayMs = Math.min(5000, 500 * 2 ** (this.reconnectAttempts - 1));
    this.handlers.onStatus?.("reconnecting");

    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  private handleMessage(rawData: unknown): void {
    let message: any;
    try {
      message = JSON.parse(String(rawData));
    } catch {
      return;
    }

    if (!message || typeof message.type !== "string") return;

    if (message.type === "WELCOME") {
      this.lastServerSeq = typeof message.lastServerSeq === "number" ? message.lastServerSeq : 0;
      this.queuedBroadcasts.clear();
      this.handlers.onWelcome?.(message as WelcomeMessage);
      return;
    }

    if (message.type === "OP_ACCEPTED") {
      if (typeof message.clientOpId === "string") {
        this.pendingOps.delete(message.clientOpId);
      }
      return;
    }

    if (message.type === "OP_REJECTED") {
      if (typeof message.clientOpId === "string") {
        this.pendingOps.delete(message.clientOpId);
      }
      this.handlers.onRejected?.(message as RejectMessage);
      return;
    }

    if (message.type === "OP_BROADCAST") {
      this.queueBroadcast(message as BroadcastMessage);
      return;
    }

    if (message.type === "PRESENCE") {
      this.handlers.onPresence?.(message as PresenceMessage);
      return;
    }

    if (message.type === "CURSOR_BROADCAST") {
      this.handlers.onCursor?.(message as CursorMessage);
      return;
    }
  }

  private queueBroadcast(message: BroadcastMessage): void {
    if (message.serverSeq <= this.lastServerSeq) {
      return;
    }

    this.queuedBroadcasts.set(message.serverSeq, message);
    this.flushBroadcastQueue();
  }

  private flushBroadcastQueue(): void {
    while (this.queuedBroadcasts.has(this.lastServerSeq + 1)) {
      const nextSeq = this.lastServerSeq + 1;
      const message = this.queuedBroadcasts.get(nextSeq);
      if (!message) break;

      this.queuedBroadcasts.delete(nextSeq);
      this.lastServerSeq = nextSeq;
      this.handlers.onBroadcast?.(message);
    }
  }
}
