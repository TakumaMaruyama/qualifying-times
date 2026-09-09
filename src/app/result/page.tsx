import { Suspense } from "react";

import { CheerButton } from "@/components/cheer-button";
import { ResultClient } from "@/components/result-client";

export default function ResultPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6">
      <div className="mb-5">
        <CheerButton compact />
      </div>
      <Suspense fallback={<p>読み込み中...</p>}>
        <ResultClient />
      </Suspense>
    </main>
  );
}
