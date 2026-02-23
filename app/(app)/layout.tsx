"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { ApiClientError, apiPost } from "@/src/lib/client/api";
import { useMe } from "@/src/lib/client/auth";
import { Badge } from "@/src/components/ui/Badge";
import { Toast } from "@/src/components/ui/Toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, refresh } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  const roleTone = user.role === "ADMIN" ? "danger" : user.role === "TUTOR" ? "info" : "neutral";

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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>UniDigitalized</div>
          <nav style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <Link href="/sessions" style={{ opacity: pathname.startsWith("/sessions") ? 1 : 0.7 }}>
              Sessions
            </Link>
            {user.role === "ADMIN" ? (
              <Link href="/admin" style={{ opacity: pathname.startsWith("/admin") ? 1 : 0.7 }}>
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{user.email}</span>
          <Badge text={user.role} tone={roleTone} />
          <button
            onClick={async () => {
              try {
                await apiPost("/api/auth/logout");
                await refresh();
                router.replace("/login");
              } catch (error) {
                setToast({
                  text: error instanceof ApiClientError ? error.message : "Logout failed",
                  tone: "error",
                });
              }
            }}
          >
            Logout
          </button>
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
      {toast ? <Toast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
