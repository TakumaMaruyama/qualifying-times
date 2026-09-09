"use client";

import { useId, useState } from "react";
import { STANDARD_LEVELS, type StandardLevel } from "@/lib/domain";
import { formatCompareAgeLabel } from "@/lib/compare-age";
import { formatEventCodeLabel } from "@/lib/event";
import { groupMeets, resolveGroupCourse, formatStandardTime, type SearchMeetResult } from "@/lib/standard-presentation";
import type { StandardViewPreferences } from "@/lib/standard-view-preferences";

export type StandardsSearchResponse = {
  targetAges: number[];
  gender: "M" | "F";
  course: SearchMeetResult["meet_course"];
  season: number | null;
  results: Record<StandardLevel, SearchMeetResult[]>;
};

const LEVEL_LABELS = { national: "全国", kyushu: "九州", kagoshima: "鹿児島" };
const COURSE_LABELS = { LCM: "長水路", SCM: "短水路", ANY: "共通" };
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export function resolveAvailablePreferences(preferences: StandardViewPreferences, data: StandardsSearchResponse): StandardViewPreferences {
  const groups = groupMeets(preferences.level, data.results[preferences.level]);
  const group = groups.find((item) => item.key === preferences.meetByLevel[preferences.level]) ?? groups[0];
  if (!group) return preferences;
  const course = resolveGroupCourse(group, preferences.courseByMeet[group.key]);
  return {
    ...preferences,
    meetByLevel: { ...preferences.meetByLevel, [preferences.level]: group.key },
    courseByMeet: { ...preferences.courseByMeet, [group.key]: course.meet_course },
  };
}

export function StandardsResults({ data, preferences, onPreferencesChange }: {
  data: StandardsSearchResponse;
  preferences: StandardViewPreferences;
  onPreferencesChange: (preferences: StandardViewPreferences) => void;
}) {
  const id = useId();
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const groupsByLevel = Object.fromEntries(STANDARD_LEVELS.map((level) => [level, groupMeets(level, data.results[level])])) as Record<StandardLevel, ReturnType<typeof groupMeets>>;
  const groups = groupsByLevel[preferences.level];
  const activeKey = groups.find((group) => group.key === preferences.meetByLevel[preferences.level])?.key ?? groups[0]?.key;

  return (
    <section aria-label="大会の標準記録" className="min-w-0 space-y-3">
      <div role="group" aria-label="地域" className="grid grid-cols-3 gap-2">
        {STANDARD_LEVELS.map((level) => (
          <button key={level} type="button" aria-pressed={preferences.level === level}
            onClick={() => { setClosedKey(null); onPreferencesChange(resolveAvailablePreferences({ ...preferences, level }, data)); }}
            className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-semibold ${FOCUS} ${preferences.level === level ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"}`}>
            {LEVEL_LABELS[level]}<span className="ml-1 text-xs font-normal">{groupsByLevel[level].length}大会</span>
          </button>
        ))}
      </div>
      {groups.length === 0 ? <p role="status" className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600">{LEVEL_LABELS[preferences.level]}には、選択した性別・年齢に該当する標準記録がありません。</p> : null}
      {groups.map((group, index) => {
        const open = activeKey === group.key && closedKey !== group.key;
        const selected = resolveGroupCourse(group, preferences.courseByMeet[group.key]);
        const titleId = `${id}-${index}-title`;
        const panelId = `${id}-${index}-panel`;
        return (
          <article key={group.key} className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <h2>
              <button type="button" id={titleId} aria-expanded={open} aria-controls={panelId}
                onClick={(event) => {
                  const button = event.currentTarget;
                  setClosedKey(open ? group.key : null);
                  onPreferencesChange(resolveAvailablePreferences({ ...preferences, meetByLevel: { ...preferences.meetByLevel, [preferences.level]: group.key } }, data));
                  // Collapsing a long preceding table can move the new heading above the viewport.
                  if (!open) requestAnimationFrame(() => {
                    if (button.getBoundingClientRect().top < 0) button.scrollIntoView({ block: "start", behavior: "smooth" });
                  });
                }}
                className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left text-base font-semibold hover:bg-zinc-50 ${FOCUS}`}>
                <span>{group.name}</span><span aria-hidden="true" className="shrink-0 text-xl font-normal text-zinc-500">{open ? "−" : "+"}</span>
              </button>
            </h2>
            <div id={panelId} role="region" aria-labelledby={titleId} hidden={!open} className="border-t border-zinc-200">
              {group.courses.length > 1 ? (
                <div role="group" aria-label={`${group.name}の水路`} className="flex gap-2 p-3">
                  {group.courses.map((course) => (
                    <button key={course.meet_course} type="button" aria-pressed={selected.meet_course === course.meet_course}
                      onClick={() => onPreferencesChange({ ...preferences, courseByMeet: { ...preferences.courseByMeet, [group.key]: course.meet_course } })}
                      className={`min-h-11 rounded-md border px-4 py-2 text-sm font-medium ${FOCUS} ${selected.meet_course === course.meet_course ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}>
                      {COURSE_LABELS[course.meet_course]}
                    </button>
                  ))}
                </div>
              ) : <p className="px-4 py-3 text-sm text-zinc-600">{COURSE_LABELS[selected.meet_course]}の標準記録</p>}
              <div role="region" aria-label={`${group.name}の記録表（横にスクロールできます）`} tabIndex={0} className={`max-w-full overflow-x-auto overscroll-x-contain ${FOCUS}`}>
                <table className="w-full border-collapse text-base tabular-nums">
                  <caption className="sr-only">{group.name}・{COURSE_LABELS[selected.meet_course]}・{data.gender === "M" ? "男子" : "女子"}の標準記録</caption>
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-sm">
                      <th scope="col" className="sticky left-0 z-10 min-w-32 bg-zinc-50 px-4 py-3 text-left">種目</th>
                      {data.targetAges.map((age) => <th scope="col" key={age} className="min-w-24 whitespace-nowrap px-4 py-3 text-right">{formatCompareAgeLabel(age)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(new Set(selected.items.map((item) => item.event_code))).map((eventCode) => {
                      const times = new Map(selected.items.filter((item) => item.event_code === eventCode).map((item) => [item.age, item.time]));
                      return (
                        <tr key={eventCode} className="border-b border-zinc-100 last:border-b-0">
                          <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-sm font-normal">{formatEventCodeLabel(eventCode)}</th>
                          {data.targetAges.map((age) => <td key={age} className="whitespace-nowrap px-4 py-3 text-right font-medium">{times.has(age) ? formatStandardTime(times.get(age)!) : <span aria-label="標準記録なし">—</span>}</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
