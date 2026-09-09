"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DisplayHelp } from "@/components/display-help";
import { SearchControls } from "@/components/search-controls";
import { SearchExtras } from "@/components/search-extras";
import { type Gender } from "@/lib/domain";
import { COMPARE_AGE_OPTIONS } from "@/lib/compare-age";
import { buildResultQuery } from "@/lib/result-conditions";
import {
  readSearchHistory,
  type SearchHistoryItem,
  type StoredSearchInput,
  upsertSearchHistory,
  writeLastSearchInput,
} from "@/lib/search-history";

type FormValues = Pick<StoredSearchInput, "playerName" | "gender" | "targetAges">;

const INITIAL_VALUES: FormValues = { playerName: "", gender: "M", targetAges: [...COMPARE_AGE_OPTIONS] };

function toStoredInput(values: FormValues): StoredSearchInput {
  return { ...values, course: "ANY", season: "" };
}

function resultHref(
  values: Pick<FormValues, "gender" | "targetAges">,
  course: StoredSearchInput["course"] = "ANY",
): string {
  return `/result?${buildResultQuery({ ...values, course })}`;
}

export function SearchForm() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [ageError, setAgeError] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHistory(readSearchHistory()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const updateControls = (next: { gender: Gender; targetAges: number[] }) => {
    setValues((current) => ({ ...current, ...next }));
    if (next.targetAges.length > 0) setAgeError(null);
  };

  const selectHistory = (item: SearchHistoryItem) => {
    const next: FormValues = { playerName: item.playerName, gender: item.gender, targetAges: item.targetAges };
    setValues(next);
    setAgeError(null);
    const stored: StoredSearchInput = {
      playerName: next.playerName,
      gender: next.gender,
      course: item.course,
      season: item.season,
      targetAges: next.targetAges,
    };
    writeLastSearchInput(stored);
    setHistory(upsertSearchHistory(stored));
    router.push(resultHref(next, item.course));
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (values.targetAges.length === 0) {
      setAgeError("年齢を1つ以上選択してください。");
      return;
    }
    const stored = toStoredInput(values);
    writeLastSearchInput(stored);
    setHistory(upsertSearchHistory(stored));
    router.push(resultHref(values));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <SearchControls gender={values.gender} targetAges={values.targetAges} onChange={updateControls} />
      {ageError ? <p role="alert" className="text-sm text-red-700">{ageError}</p> : null}
      <button type="submit" className="min-h-11 w-full rounded bg-zinc-900 px-4 py-2 font-medium text-white outline-offset-2 hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900">
        検索する
      </button>
      <SearchExtras
        playerName={values.playerName}
        onPlayerNameChange={(playerName) => setValues((current) => ({ ...current, playerName }))}
        history={history}
        onHistorySelect={selectHistory}
      />
      <DisplayHelp />
    </form>
  );
}
