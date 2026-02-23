"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, ApiClientError } from "./api";

export type MeUser = {
  id: string;
  email: string;
  role: "ADMIN" | "TUTOR" | "STUDENT";
};

type MeResponse = {
  user: MeUser;
};

type MeState = {
  loading: boolean;
  user: MeUser | null;
  error: ApiClientError | null;
  refresh: () => Promise<void>;
};

let cachedUser: MeUser | null = null;
let cacheLoaded = false;

export async function fetchMe(): Promise<MeUser | null> {
  try {
    const response = await apiGet<MeResponse>("/api/auth/me");
    cachedUser = response.user;
    cacheLoaded = true;
    return response.user;
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
      cachedUser = null;
      cacheLoaded = true;
      return null;
    }
    throw error;
  }
}

export function useMe(): MeState {
  const [loading, setLoading] = useState(!cacheLoaded);
  const [user, setUser] = useState<MeUser | null>(cachedUser);
  const [error, setError] = useState<ApiClientError | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchMe();
      setUser(next);
    } catch (err) {
      setError(err as ApiClientError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!cacheLoaded) {
      void refresh();
    }
  }, []);

  return useMemo(
    () => ({ loading, user, error, refresh }),
    [loading, user, error],
  );
}
