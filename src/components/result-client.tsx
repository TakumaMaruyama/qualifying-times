"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { DisplayHelp } from "@/components/display-help";
import { SearchControls } from "@/components/search-controls";
import { SearchExtras } from "@/components/search-extras";
import { StandardsResults, resolveAvailablePreferences, type StandardsSearchResponse } from "@/components/standards-results";
import { formatCourseStandardRecordLabel } from "@/lib/course-label";
import { JSF_QUALIFICATION_URL } from "@/lib/qualification";
import { buildResultQuery, parseResultConditions, type ResultConditions } from "@/lib/result-conditions";
import { readLastSearchInput, readSearchHistory, upsertSearchHistory, writeLastSearchInput, type SearchHistoryItem, type StoredSearchInput } from "@/lib/search-history";
import { readViewPreferences, writeViewPreferences } from "@/lib/standard-view-preferences";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function replaceQuery(query: string) {
  // Next.js synchronizes native history changes with useSearchParams, without navigation or scrolling.
  window.history.replaceState(null, "", `/result?${query}`);
}

export function ResultClient() {
  const params = useSearchParams();
  const hydrated = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  if (!hydrated) return <p role="status">読み込み中...</p>;
  return <ResultSearch query={params.toString()} onQueryChange={replaceQuery} />;
}

type SearchResponse = { key: string; attempt: number } & (
  | { data: StandardsSearchResponse; error?: never }
  | { data?: never; error: string }
);

export function ResultSearch({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const [savedInput] = useState(readLastSearchInput);
  const { conditions, error: conditionError } = useMemo(() => parseResultConditions(query, savedInput), [query, savedInput]);
  const [playerName, setPlayerName] = useState(() => savedInput && buildResultQuery(savedInput) === buildResultQuery(conditions) ? savedInput.playerName : "");
  const nameRef = useRef(playerName);
  const [history, setHistory] = useState(readSearchHistory);
  const [preferences, setPreferences] = useState(readViewPreferences);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify({ ...conditions, season: null });
  const valid = !conditionError && conditions.targetAges.length > 0;
  const currentResponse = valid && response?.key === requestKey && response.attempt === attempt ? response : null;

  useEffect(() => { writeViewPreferences(preferences); }, [preferences]);

  useEffect(() => {
    if (!query && savedInput) onQueryChange(buildResultQuery(savedInput));
  }, [query, savedInput, onQueryChange]);

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    const payload = JSON.parse(requestKey) as ResultConditions & { season: null };
    const storedInput = (): StoredSearchInput => ({ gender: payload.gender, course: payload.course, targetAges: payload.targetAges, season: "", playerName: nameRef.current });
    writeLastSearchInput(storedInput());

    const fetchRecords = async () => {
      try {
        const result = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestKey,
          signal: controller.signal,
        });
        if (!result.ok) throw new Error("Search failed");
        const data = await result.json() as StandardsSearchResponse;
        // Some transports can finish after abort; never accept a superseded result.
        if (controller.signal.aborted) return;
        setResponse({ key: requestKey, attempt, data });
        setPreferences((previous) => resolveAvailablePreferences(previous, data));
        writeLastSearchInput(storedInput());
        setHistory(upsertSearchHistory(storedInput()));
      } catch {
        if (controller.signal.aborted) return;
        setResponse({ key: requestKey, attempt, error: "標準記録を取得できませんでした。通信状況を確認して、もう一度お試しください。" });
      }
    };
    void fetchRecords();
    return () => controller.abort();
  }, [requestKey, valid, attempt]);

  const changeConditions = (next: ResultConditions) => onQueryChange(buildResultQuery(next));
  const changeName = (name: string) => {
    nameRef.current = name;
    setPlayerName(name);
  };
  const saveName = () => {
    if (!valid) return;
    const input = { ...conditions, playerName: nameRef.current, season: "" };
    writeLastSearchInput(input);
    if (currentResponse?.data) setHistory(upsertSearchHistory(input));
  };
  const selectHistory = (item: SearchHistoryItem) => {
    changeName(item.playerName);
    writeLastSearchInput({ ...item, season: "" });
    setHistory(upsertSearchHistory({ ...item, season: "" }));
    changeConditions({ gender: item.gender, course: item.course, targetAges: item.targetAges });
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">標準記録</h1>
        <a href={JSF_QUALIFICATION_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-zinc-600 underline underline-offset-4">資格級（公式）</a>
      </header>
      <section aria-label="検索条件" className="rounded-lg border border-zinc-200 bg-white p-4">
        <SearchControls gender={conditions.gender} targetAges={conditions.targetAges} onChange={(next) => changeConditions({ ...conditions, ...next })} />
        {conditions.course !== "ANY" ? <p className="mt-3 text-sm text-zinc-600">
          {formatCourseStandardRecordLabel(conditions.course)}で絞り込み中
          <button type="button" className="ml-3 min-h-11 text-zinc-900 underline" onClick={() => changeConditions({ ...conditions, course: "ANY" })}>すべて表示</button>
        </p> : null}
      </section>
      {conditionError ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{conditionError}</p> : null}
      {!conditionError && !valid ? <p role="status" className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600">年齢を1つ以上選ぶと、標準記録を表示します。</p> : null}
      {valid && !currentResponse ? <p role="status" className="py-4 text-sm text-zinc-600">標準記録を読み込み中...</p> : null}
      {currentResponse?.error ? <div role="alert" className="space-y-3 rounded-lg bg-red-50 p-4 text-sm text-red-800">
        <p>{currentResponse.error}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-11 rounded border border-red-300 bg-white px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">再試行する</button>
      </div> : null}
      {currentResponse?.data ? <StandardsResults key={requestKey} data={currentResponse.data} preferences={preferences} onPreferencesChange={setPreferences} /> : null}
      <SearchExtras playerName={playerName} onPlayerNameChange={changeName} onPlayerNameCommit={saveName} history={history} onHistorySelect={selectHistory} />
      <DisplayHelp />
      <footer className="text-right"><Link href="/admin/import" className="inline-flex min-h-11 items-center text-xs text-zinc-500 underline underline-offset-4">管理者ログイン</Link></footer>
    </div>
  );
}
