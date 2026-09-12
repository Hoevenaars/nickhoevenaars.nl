"use client";

import { useState } from "react";

type Settings = {
  max_pages_per_scan: number;
  desktop_viewport_width: number;
  desktop_viewport_height: number;
  mobile_viewport_width: number;
  mobile_viewport_height: number;
  scan_timeout_ms: number;
  retry_count: number;
  weight_mobile: number;
  weight_conversion: number;
  weight_visual: number;
  weight_technical: number;
  weight_content: number;
  max_pages_product_fit: number;
  allow_booking: boolean;
  allow_multilingual: boolean;
  allow_webshop: boolean;
  ai_model: string;
  ai_enabled: boolean;
  max_scan_cost_usd: number;
  needs_review_score_min: number;
  needs_review_score_max: number;
};

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState<string | null>(null);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setMessage(response.ok ? "Opgeslagen" : "Opslaan mislukt");
  }

  return (
    <form onSubmit={save} className="mt-6 grid gap-6">
      <fieldset className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
        <legend className="font-[var(--font-display)] font-bold">Scanning</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Max pages per scan" value={form.max_pages_per_scan} onChange={(value) => set("max_pages_per_scan", value)} />
          <NumberField label="Desktop width" value={form.desktop_viewport_width} onChange={(value) => set("desktop_viewport_width", value)} />
          <NumberField label="Desktop height" value={form.desktop_viewport_height} onChange={(value) => set("desktop_viewport_height", value)} />
          <NumberField label="Mobile width" value={form.mobile_viewport_width} onChange={(value) => set("mobile_viewport_width", value)} />
          <NumberField label="Mobile height" value={form.mobile_viewport_height} onChange={(value) => set("mobile_viewport_height", value)} />
          <NumberField label="Timeout ms" value={form.scan_timeout_ms} onChange={(value) => set("scan_timeout_ms", value)} />
          <NumberField label="Retry count" value={form.retry_count} onChange={(value) => set("retry_count", value)} />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
        <legend className="font-[var(--font-display)] font-bold">Scoring gewichten</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <NumberField label="Mobile" value={form.weight_mobile} onChange={(value) => set("weight_mobile", value)} />
          <NumberField label="Conversion" value={form.weight_conversion} onChange={(value) => set("weight_conversion", value)} />
          <NumberField label="Visual" value={form.weight_visual} onChange={(value) => set("weight_visual", value)} />
          <NumberField label="Technical" value={form.weight_technical} onChange={(value) => set("weight_technical", value)} />
          <NumberField label="Content" value={form.weight_content} onChange={(value) => set("weight_content", value)} />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
        <legend className="font-[var(--font-display)] font-bold">Product rules</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Max pages" value={form.max_pages_product_fit} onChange={(value) => set("max_pages_product_fit", value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allow_booking} onChange={(event) => set("allow_booking", event.target.checked)} />
            Allow booking
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allow_multilingual} onChange={(event) => set("allow_multilingual", event.target.checked)} />
            Allow multilingual
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allow_webshop} onChange={(event) => set("allow_webshop", event.target.checked)} />
            Allow webshop
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
        <legend className="font-[var(--font-display)] font-bold">AI & kosten</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Model
            <input
              className="mt-1 w-full rounded-xl border border-[#e6dfd2] px-3 py-2"
              value={form.ai_model}
              onChange={(event) => set("ai_model", event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ai_enabled} onChange={(event) => set("ai_enabled", event.target.checked)} />
            AI enabled
          </label>
          <NumberField label="Max scan cost USD" value={Number(form.max_scan_cost_usd)} onChange={(value) => set("max_scan_cost_usd", value)} />
          <NumberField label="Review score min" value={form.needs_review_score_min} onChange={(value) => set("needs_review_score_min", value)} />
          <NumberField label="Review score max" value={form.needs_review_score_max} onChange={(value) => set("needs_review_score_max", value)} />
        </div>
      </fieldset>

      <button className="w-fit rounded-full bg-[#1d4ed8] px-5 py-2 text-white">Opslaan</button>
      {message ? <p className="text-sm text-[#6a6573]">{message}</p> : null}
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm">
      {label}
      <input
        className="mt-1 w-full rounded-xl border border-[#e6dfd2] px-3 py-2"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
