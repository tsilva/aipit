"use client";

import dynamic from "next/dynamic";

const PitStudio = dynamic(() => import("@/components/pit-studio").then((module) => module.PitStudio), {
  ssr: false,
  loading: () => (
    <main className="studio-page">
      <div className="mx-auto flex min-h-screen w-full max-w-[90rem] items-center justify-center px-4 py-12 text-sm text-[color:var(--muted)] sm:px-5 lg:px-6">
        Loading council...
      </div>
    </main>
  ),
});

export function PitStudioEntry() {
  return <PitStudio />;
}
