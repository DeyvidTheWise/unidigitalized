"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiPost } from "@/src/lib/client/api";
import { useMe } from "@/src/lib/client/auth";

type AuthResponse = {
  user: {
    id: string;
    email: string;
    role: "ADMIN" | "TUTOR" | "STUDENT";
  };
};

export default function LoginPage() {
  const router = useRouter();
  const { loading, user, refresh } = useMe();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/sessions");
    }
  }, [loading, user, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiPost<AuthResponse>("/api/auth/login", { email, password });
      await refresh();
      router.replace("/sessions");
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "DEVICE_LIMIT_REACHED") {
          setError("This account has reached the max verified device limit.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Login failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Sign In</h2>
      <p style={{ color: "#475569", fontSize: 14 }}>Continue to your sessions.</p>

      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
        {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
        <button disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</button>
      </form>

      <p style={{ marginTop: 12, fontSize: 13 }}>
        No account? <Link href="/register">Create one</Link>
      </p>
    </div>
  );
}
