"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/src/lib/client/auth";

export default function HomePage() {
  const { loading, user } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/sessions" : "/login");
    }
  }, [loading, user, router]);

  return <div style={{ padding: 24 }}>Redirecting...</div>;
}
