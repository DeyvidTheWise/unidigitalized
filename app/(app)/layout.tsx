"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/src/lib/client/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          height: 56,
          borderBottom: "1px solid #d1d5db",
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
      >
        <div style={{ fontWeight: 600 }}>UniDigitalized</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{user.email}</span>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.replace("/login");
            }}
          >
            Logout
          </button>
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
