"use client";

import dynamic from "next/dynamic";

// three.js is ~600 KB and belongs to this route alone. `ssr: false` because WebGL needs a
// canvas that does not exist on the server, and next/dynamic's docs are explicit that
// ssr:false has to be called from a Client Component — a Server Component importing a
// Client Component this way does not code-split.
const CaseScene = dynamic(() => import("./CaseScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center text-sm text-label-dim">
      Building the case…
    </div>
  ),
});

export default function CaseSpikeClient(props: { posterUrl: string; tint: string }) {
  return <CaseScene {...props} />;
}
