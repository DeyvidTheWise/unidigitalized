"use client";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<BadgeTone, { bg: string; border: string; color: string }> = {
  neutral: { bg: "#f8fafc", border: "#cbd5e1", color: "#334155" },
  success: { bg: "#ecfdf5", border: "#86efac", color: "#166534" },
  warning: { bg: "#fffbeb", border: "#fcd34d", color: "#92400e" },
  danger: { bg: "#fef2f2", border: "#fca5a5", color: "#991b1b" },
  info: { bg: "#eff6ff", border: "#93c5fd", color: "#1d4ed8" },
};

export function Badge({ text, tone = "neutral" }: { text: string; tone?: BadgeTone }) {
  const style = toneStyles[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${style.border}`,
        background: style.bg,
        color: style.color,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  );
}
