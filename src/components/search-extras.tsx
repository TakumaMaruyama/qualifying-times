"use client";

import { formatCompareAgeLabel } from "@/lib/compare-age";
import { type SearchHistoryItem } from "@/lib/search-history";

type SearchExtrasProps = {
  playerName: string;
  onPlayerNameChange: (value: string) => void;
  onPlayerNameCommit?: () => void;
  history: SearchHistoryItem[];
  onHistorySelect: (item: SearchHistoryItem) => void;
};

const GENDER_LABELS = { M: "男子", F: "女子" } as const;

function formatSearchedAt(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function SearchExtras({ playerName, onPlayerNameChange, onPlayerNameCommit, history, onHistorySelect }: SearchExtrasProps) {
  return <details className="border-t border-zinc-200 pt-4">
    <summary className="cursor-pointer text-sm font-medium">選手名・履歴</summary>
    <div className="mt-3 space-y-4">
      <div>
        <label htmlFor="player-name" className="mb-1 block text-sm font-medium">選手名（任意）</label>
        <input id="player-name" type="text" value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} onBlur={onPlayerNameCommit}
          className="min-h-11 w-full rounded border border-zinc-300 px-3 py-2 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900" placeholder="例: 山田 太郎" maxLength={50} />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-medium">検索履歴</h2>
        {history.length === 0 ? <p className="text-xs text-zinc-600">履歴はありません。</p> : <div className="space-y-2">
          {history.map((item, index) => {
            const label = [item.playerName, GENDER_LABELS[item.gender], item.targetAges.map((age) => formatCompareAgeLabel(age)).join(", ")].filter(Boolean).join(" / ");
            const searchedAt = formatSearchedAt(item.searchedAt);
            return <button key={`${item.playerName}-${item.gender}-${item.course}-${item.season}-${item.searchedAt}-${index}`} type="button" onClick={() => onHistorySelect(item)}
              className="min-h-11 w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm outline-offset-2 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900">
              {label}{searchedAt ? <span className="text-xs text-zinc-600">（{searchedAt}）</span> : null}
            </button>;
          })}
        </div>}
      </div>
    </div>
  </details>;
}
