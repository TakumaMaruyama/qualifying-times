"use client";

import { COURSE_ANY_DESCRIPTION } from "@/lib/course-label";

export function DisplayHelp() {
  return <details className="border-t border-zinc-200 pt-4">
    <summary className="cursor-pointer text-sm font-medium">表示について</summary>
    <div className="mt-3 space-y-1 text-xs leading-5 text-zinc-600">
      <p>各大会・水路区分ごとに、登録済みの最新の標準記録を表示します。</p>
      <p>{COURSE_ANY_DESCRIPTION}</p>
    </div>
  </details>;
}
