"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ACTIONS = [
  { decision: "reject", label: "Reject" },
  { decision: "watchlist", label: "Watchlist" },
  { decision: "sales_ready", label: "Sales Ready" },
  { decision: "priority", label: "Priority" },
  { decision: "rescan", label: "Rescan" },
] as const;

export default function ReviewActions({
  prospectId,
  canPreview,
}: {
  prospectId: string;
  canPreview: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: string) {
    setPending(decision);
    setError(null);
    const response = await fetch(`/api/prospects/${prospectId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, notes }),
    });
    const json = await response.json();
    setPending(null);
    if (!response.ok) {
      setError(json.error ?? "Review mislukt");
      return;
    }
    router.refresh();
  }

  async function preview() {
    setPending("preview");
    setError(null);
    const response = await fetch(`/api/prospects/${prospectId}/preview`, { method: "POST" });
    const json = await response.json();
    setPending(null);
    if (!response.ok) {
      setError(json.error ?? "Preview mislukt");
      return;
    }
    router.push(json.url);
  }

  return (
    <section className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
      <h2 className="font-[var(--font-display)] text-lg font-bold">Human Review</h2>
      <p className="mt-1 text-sm text-[#6a6573]">
        De workflow heeft al gescoord. Jouw besluit wordt trainingsdata.
      </p>
      <textarea
        className="mt-3 w-full rounded-xl border border-[#e6dfd2] px-3 py-2 text-sm"
        rows={3}
        placeholder="Notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <button
            key={action.decision}
            className="rounded-full border border-[#e6dfd2] bg-white px-4 py-2 text-sm disabled:opacity-60"
            disabled={Boolean(pending)}
            onClick={() => review(action.decision)}
          >
            {pending === action.decision ? "…" : action.label}
          </button>
        ))}
        <button
          className="rounded-full bg-[#1d4ed8] px-4 py-2 text-sm text-white disabled:opacity-60"
          disabled={!canPreview || Boolean(pending)}
          onClick={preview}
        >
          {pending === "preview" ? "…" : "Generate Preview"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-[#b42318]">{error}</p> : null}
    </section>
  );
}
