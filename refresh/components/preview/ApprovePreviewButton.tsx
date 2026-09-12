"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ApprovePreviewButton({
  previewId,
  approved,
}: {
  previewId: string;
  approved: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function approve() {
    setPending(true);
    await fetch(`/api/previews/${previewId}/approve`, { method: "POST" });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      className="rounded-full bg-[#0f7a5a] px-4 py-2 text-sm text-white disabled:opacity-60"
      disabled={approved || pending}
      onClick={approve}
    >
      {approved ? "Approved" : pending ? "…" : "Approve Preview"}
    </button>
  );
}
