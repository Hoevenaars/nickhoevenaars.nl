"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function ProspectFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/prospects?${next.toString()}`);
  }

  return (
    <form className="grid gap-2 rounded-2xl border border-[#e6dfd2] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <select
        className="rounded-xl border border-[#e6dfd2] px-3 py-2 text-sm"
        defaultValue={params.get("status") ?? ""}
        onChange={(event) => update("status", event.target.value)}
      >
        <option value="">Alle statussen</option>
        {[
          "NEW",
          "SCANNING",
          "SCAN_FAILED",
          "QUALIFIED",
          "WATCHLIST",
          "SALES_READY",
          "PRIORITY",
          "REJECTED",
          "PREVIEW_READY",
        ].map((status) => (
          <option key={status}>{status}</option>
        ))}
      </select>
      <input
        className="rounded-xl border border-[#e6dfd2] px-3 py-2 text-sm"
        placeholder="Branche"
        defaultValue={params.get("industry") ?? ""}
        onBlur={(event) => update("industry", event.target.value)}
      />
      <select
        className="rounded-xl border border-[#e6dfd2] px-3 py-2 text-sm"
        defaultValue={params.get("source") ?? ""}
        onChange={(event) => update("source", event.target.value)}
      >
        <option value="">Alle bronnen</option>
        {["manual", "import", "referral", "automatic_discovery", "browser_extension"].map((source) => (
          <option key={source}>{source}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          className="w-full rounded-xl border border-[#e6dfd2] px-3 py-2 text-sm"
          placeholder="Min score"
          defaultValue={params.get("minScore") ?? ""}
          onBlur={(event) => update("minScore", event.target.value)}
        />
        <input
          className="w-full rounded-xl border border-[#e6dfd2] px-3 py-2 text-sm"
          placeholder="Max score"
          defaultValue={params.get("maxScore") ?? ""}
          onBlur={(event) => update("maxScore", event.target.value)}
        />
      </div>
    </form>
  );
}
