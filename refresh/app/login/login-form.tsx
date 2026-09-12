"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const action =
      mode === "in"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error: authError } = await action;
    setPending(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        E-mail
        <input
          className="mt-1 w-full rounded-xl border border-[#e6dfd2] bg-white px-3 py-2"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        Wachtwoord
        <input
          className="mt-1 w-full rounded-xl border border-[#e6dfd2] bg-white px-3 py-2"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />
      </label>
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      <button
        className="w-full rounded-full bg-[#1d4ed8] px-4 py-2.5 font-[var(--font-display)] text-white"
        disabled={pending}
        type="submit"
      >
        {pending ? "Bezig…" : mode === "in" ? "Inloggen" : "Account maken"}
      </button>
      <button
        type="button"
        className="w-full text-sm text-[#6a6573]"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
      >
        {mode === "in" ? "Eerste keer? Maak een intern account" : "Heb je al een account? Log in"}
      </button>
    </form>
  );
}
