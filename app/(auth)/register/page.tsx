"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiPost } from "@/src/lib/client/api";
import { useMe } from "@/src/lib/client/auth";

type AuthResponse = {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: "ADMIN" | "TUTOR" | "STUDENT";
  };
};

export default function RegisterPage() {
  const router = useRouter();
  const { loading, user, refresh } = useMe();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError("First and last name must be at least 2 characters.");
      return;
    }
    if (!email.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      await apiPost<AuthResponse>("/api/auth/register", { firstName, lastName, email, password });
      await refresh();
      router.replace("/sessions");
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "DEVICE_LIMIT_REACHED") setError("This account has reached the max verified device limit.");
        else if (err.code === "EMAIL_ALREADY_EXISTS") setError("Email is already registered.");
        else setError(err.message);
      } else {
        setError("Registration failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Create Account</h2>
      <p style={{ color: "#475569", fontSize: 14 }}>Register to start collaborating.</p>

      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required />
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
        {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
        <button disabled={submitting}>{submitting ? "Creating..." : "Create account"}</button>
      </form>

      <p style={{ marginTop: 12, fontSize: 13 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
