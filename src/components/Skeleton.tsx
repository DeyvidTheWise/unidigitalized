"use client";

type SkeletonProps = {
  height?: number;
  width?: string;
};

export function Skeleton({ height = 16, width = "100%" }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 8,
        background: "linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 37%,#e5e7eb 63%)",
        backgroundSize: "400% 100%",
        animation: "skeleton-shimmer 1.2s ease-in-out infinite",
      }}
    />
  );
}
