"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  message: string;
  tone?: "success" | "error";
  onDone?: () => void;
};

export function Toast({ message, tone = "success", onDone }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 200,
        background: tone === "success" ? "#ecfdf5" : "#fef2f2",
        color: tone === "success" ? "#065f46" : "#991b1b",
        border: `1px solid ${tone === "success" ? "#6ee7b7" : "#fca5a5"}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}
