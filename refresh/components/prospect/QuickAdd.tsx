"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QuickAdd() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/prospects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ websiteUrl: url, companyName, notes }),
    });
    const json = await response.json();
    setPending(false);
    if (!response.ok && response.status !== 202) {
      setError(json.error ?? "Toevoegen mislukt");
      return;
    }
    setUrl("");
    setCompanyName("");
    setNotes("");
    setOpen(false);
    router.push(`/prospects/${json.prospectId}`);
    router.refresh();
  }

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          className="min-w-56 flex-1 rounded-full border border-[#e6dfd2] bg-white px-4 py-2 text-sm"
          placeholder="Website URL"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
        <button
          type="button"
          className="text-sm text-[#6a6573]"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Minder" : "Optioneel"}
        </button>
        <button
          className="rounded-full bg-[#1d4ed8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={pending}
        >
          {pending ? "Scannen…" : "Add & Scan"}
        </button>
      </form>
      {open ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-xl border border-[#e6dfd2] bg-white px-3 py-2 text-sm"
            placeholder="Bedrijfsnaam"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
          <input
            className="rounded-xl border border-[#e6dfd2] bg-white px-3 py-2 text-sm"
            placeholder="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-[#b42318]">{error}</p> : null}
    </div>
  );
}
