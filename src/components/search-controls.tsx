"use client";

import { COMPARE_AGE_OPTIONS, formatCompareAgeLabel } from "@/lib/compare-age";
import { type Gender } from "@/lib/domain";

type SearchControlsProps = {
  gender: Gender;
  targetAges: number[];
  onChange: (next: { gender: Gender; targetAges: number[] }) => void;
};

const GENDER_LABELS: Record<Gender, string> = { M: "男子", F: "女子" };

export function SearchControls({ gender, targetAges, onChange }: SearchControlsProps) {
  const allSelected = COMPARE_AGE_OPTIONS.every((age) => targetAges.includes(age));
  const toggleAge = (age: number) => {
    const nextAges = targetAges.includes(age)
      ? targetAges.filter((value) => value !== age)
      : [...targetAges, age].sort((a, b) => a - b);
    onChange({ gender, targetAges: nextAges });
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">性別</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["M", "F"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={gender === value}
              onClick={() => onChange({ gender: value, targetAges })}
              className={`min-h-11 rounded border px-3 py-2 text-sm font-medium outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900 ${gender === value ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"}`}>
              {GENDER_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 w-full text-sm font-medium">
          <span className="flex items-center justify-between gap-2">
            <span>年齢（複数選択）</span>
            <button type="button" disabled={allSelected}
              onClick={() => onChange({ gender, targetAges: [...COMPARE_AGE_OPTIONS] })}
              className="min-h-11 rounded border border-zinc-300 px-3 py-2 text-sm outline-offset-2 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:cursor-default disabled:opacity-50">
              全選択
            </button>
          </span>
        </legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {COMPARE_AGE_OPTIONS.map((age) => {
            const selected = targetAges.includes(age);
            return <button key={age} type="button" aria-pressed={selected} onClick={() => toggleAge(age)}
              className={`min-h-11 rounded border px-2 py-2 text-sm outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900 ${selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"}`}>
              {formatCompareAgeLabel(age)}
            </button>;
          })}
        </div>
      </fieldset>
    </div>
  );
}
