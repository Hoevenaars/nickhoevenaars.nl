import type { ProspectStatus } from "@/types";

const STYLES: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700",
  VALIDATING: "bg-slate-100 text-slate-700",
  SCANNING: "bg-blue-50 text-blue-700",
  SCAN_FAILED: "bg-red-50 text-red-700",
  ANALYSING: "bg-violet-50 text-violet-700",
  QUALIFIED: "bg-emerald-50 text-emerald-800",
  WATCHLIST: "bg-amber-50 text-amber-800",
  SALES_READY: "bg-blue-100 text-blue-800",
  PRIORITY: "bg-indigo-100 text-indigo-800",
  REJECTED: "bg-rose-50 text-rose-700",
  PREVIEW_READY: "bg-teal-50 text-teal-800",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

export default function StatusBadge({ status }: { status: ProspectStatus | string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.NEW}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
