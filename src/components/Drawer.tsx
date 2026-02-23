"use client";

import type { ReactNode } from "react";

type DrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Drawer({ open, title, onClose, children }: DrawerProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: open ? 0 : -380,
        width: 360,
        height: "100%",
        background: "#ffffff",
        borderLeft: "1px solid #d1d5db",
        boxShadow: open ? "-8px 0 24px rgba(0,0,0,0.08)" : "none",
        transition: "right 140ms ease",
        zIndex: 30,
        overflowY: "auto",
      }}
    >
      <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
        <strong>{title}</strong>
        <button onClick={onClose}>Close</button>
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}
