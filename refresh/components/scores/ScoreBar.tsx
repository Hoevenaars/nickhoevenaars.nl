export default function ScoreBar({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number | null | undefined;
  max?: number;
}) {
  const safe = Number(value ?? 0);
  const width = Math.max(0, Math.min(100, (safe / max) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-[#6a6573]">
        <span>{label}</span>
        <span>{safe.toFixed(0)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#e6dfd2]">
        <div className="h-full rounded-full bg-[#1d4ed8]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
