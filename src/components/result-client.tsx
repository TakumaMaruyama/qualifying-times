"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  formatCompareAgeLabel,
  normalizeCompareAges,
} from "@/lib/compare-age";
import {
  COURSE_ANY_DESCRIPTION,
  formatCourseStandardRecordLabel,
} from "@/lib/course-label";
import {
  COURSES,
  GENDERS,
  STANDARD_LEVELS,
  type Course,
  type StandardLevel,
} from "@/lib/domain";
import { formatEventCodeLabel } from "@/lib/event";

type SearchMeetResult = {
  meet_id: string;
  meet_name: string;
  meet_season: number;
  meet_course: Course;
  meet_date: string | null;
  meet_date_end: string | null;
  meet_metadata: Record<string, unknown> | null;
  items: Array<{ event_code: string; age: number; time: string }>;
};

type SearchApiResponse = {
  targetAges: number[];
  season: number | null;
  course: Course;
  gender: "M" | "F";
  results: Record<StandardLevel, SearchMeetResult[]>;
};

type LikeStatus = {
  count: number;
  liked: boolean;
};

type ReactionsSummaryResponse = {
  meetLikes: Record<string, LikeStatus>;
  eventLikes: Record<string, Record<string, LikeStatus>>;
};

type ReactionsSummaryRequest = {
  meetIds: string[];
  eventsByMeet: Record<string, string[]>;
};

const LEVEL_LABELS: Record<StandardLevel, string> = {
  national: "全国レベル",
  kyushu: "九州レベル",
  kagoshima: "県レベル（鹿児島）",
};

const GENDER_LABELS: Record<"M" | "F", string> = {
  M: "男子",
  F: "女子",
};

const EMPTY_LIKE_STATUS: LikeStatus = {
  count: 0,
  liked: false,
};

function isCourse(value: string | null): value is Course {
  return value !== null && COURSES.includes(value as Course);
}

function isGender(value: string | null): value is "M" | "F" {
  return value !== null && GENDERS.includes(value as "M" | "F");
}

function parseTargetAges(raw: string): number[] | null {
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const parsed: number[] = [];
  for (const value of values) {
    const age = Number.parseInt(value, 10);
    if (!Number.isInteger(age) || age < 9 || age > 17) {
      return null;
    }
    parsed.push(age);
  }

  return normalizeCompareAges(parsed);
}

function formatMeetDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate) {
    return "未設定";
  }
  if (!endDate || endDate === startDate) {
    return startDate;
  }
  return `${startDate} 〜 ${endDate}`;
}

function buildReactionsSummaryRequest(data: SearchApiResponse): ReactionsSummaryRequest {
  const meetIds: string[] = [];
  const eventsByMeet: Record<string, string[]> = {};

  for (const level of STANDARD_LEVELS) {
    for (const meet of data.results[level]) {
      if (eventsByMeet[meet.meet_id]) {
        continue;
      }

      meetIds.push(meet.meet_id);
      eventsByMeet[meet.meet_id] = Array.from(
        new Set(meet.items.map((item) => item.event_code)),
      );
    }
  }

  return { meetIds, eventsByMeet };
}

function getEventLikeKey(meetId: string, eventCode: string): string {
  return `${meetId}|${eventCode}`;
}

export function ResultClient() {
  const params = useSearchParams();

  const requestPayload = useMemo(() => {
    const gender = params.get("gender");
    const courseParam = params.get("course");
    const targetAgesRaw = params.get("targetAges") ?? params.get("compareAges");

    if (!isGender(gender)) {
      return { error: "gender が不正です。" };
    }

    const normalizedCourse =
      courseParam === null || courseParam.trim() === ""
        ? "ANY"
        : isCourse(courseParam)
          ? courseParam
          : null;

    if (normalizedCourse === null) {
      return { error: "course が不正です。" };
    }

    if (!targetAgesRaw || targetAgesRaw.trim() === "") {
      return { error: "targetAges が不正です。" };
    }

    const targetAges = parseTargetAges(targetAgesRaw);
    if (targetAges === null || targetAges.length === 0) {
      return { error: "targetAges が不正です。" };
    }

    return {
      payload: {
        gender,
        course: normalizedCourse,
        season: null,
        targetAges,
      },
    };
  }, [params]);

  const [data, setData] = useState<SearchApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [meetLikes, setMeetLikes] = useState<Record<string, LikeStatus>>({});
  const [eventLikes, setEventLikes] = useState<Record<string, Record<string, LikeStatus>>>({});
  const [pendingMeetLikes, setPendingMeetLikes] = useState<Record<string, boolean>>({});
  const [pendingEventLikes, setPendingEventLikes] = useState<Record<string, boolean>>({});

  const reactionsSummaryRequest = useMemo(() => {
    if (!data) {
      return null;
    }
    return buildReactionsSummaryRequest(data);
  }, [data]);

  useEffect(() => {
    const payload = requestPayload.payload;
    if (!payload) {
      setLoading(false);
      setError(requestPayload.error ?? "入力値が不正です。");
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const responseBody = (await response.json()) as SearchApiResponse | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in responseBody && responseBody.error
              ? responseBody.error
              : "検索に失敗しました。",
          );
        }

        if (!cancelled) {
          setData(responseBody as SearchApiResponse);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "検索に失敗しました。");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [requestPayload]);

  useEffect(() => {
    if (!reactionsSummaryRequest) {
      setReactionError(null);
      setMeetLikes({});
      setEventLikes({});
      setPendingMeetLikes({});
      setPendingEventLikes({});
      return;
    }

    let cancelled = false;

    const fetchReactionSummary = async () => {
      setReactionError(null);

      try {
        const response = await fetch("/api/reactions/summary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(reactionsSummaryRequest),
        });

        const responseBody = (await response.json()) as
          | ReactionsSummaryResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in responseBody && responseBody.error
              ? responseBody.error
              : "いいね情報の取得に失敗しました。",
          );
        }

        if (!cancelled) {
          setMeetLikes((responseBody as ReactionsSummaryResponse).meetLikes);
          setEventLikes((responseBody as ReactionsSummaryResponse).eventLikes);
        }
      } catch (err) {
        if (!cancelled) {
          setMeetLikes({});
          setEventLikes({});
          setReactionError(
            err instanceof Error ? err.message : "いいね情報の取得に失敗しました。",
          );
        }
      }
    };

    void fetchReactionSummary();

    return () => {
      cancelled = true;
    };
  }, [reactionsSummaryRequest]);

  const getMeetLikeStatus = (meetId: string): LikeStatus => {
    return meetLikes[meetId] ?? EMPTY_LIKE_STATUS;
  };

  const getEventLikeStatus = (meetId: string, eventCode: string): LikeStatus => {
    return eventLikes[meetId]?.[eventCode] ?? EMPTY_LIKE_STATUS;
  };

  const handleMeetLikeClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    meetId: string,
  ): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();

    if (pendingMeetLikes[meetId]) {
      return;
    }

    setReactionError(null);
    setPendingMeetLikes((prev) => ({ ...prev, [meetId]: true }));

    try {
      const response = await fetch("/api/reactions/meet/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetId }),
      });

      const responseBody = (await response.json()) as
        | { meetId: string; liked: boolean; count: number }
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in responseBody && responseBody.error
            ? responseBody.error
            : "大会いいねの更新に失敗しました。",
        );
      }

      const body = responseBody as { meetId: string; liked: boolean; count: number };
      setMeetLikes((prev) => ({
        ...prev,
        [body.meetId]: {
          liked: body.liked,
          count: body.count,
        },
      }));
    } catch (err) {
      setReactionError(
        err instanceof Error ? err.message : "大会いいねの更新に失敗しました。",
      );
    } finally {
      setPendingMeetLikes((prev) => {
        const next = { ...prev };
        delete next[meetId];
        return next;
      });
    }
  };

  const handleEventLikeClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    meetId: string,
    eventCode: string,
  ): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();

    const eventLikeKey = getEventLikeKey(meetId, eventCode);
    if (pendingEventLikes[eventLikeKey]) {
      return;
    }

    setReactionError(null);
    setPendingEventLikes((prev) => ({ ...prev, [eventLikeKey]: true }));

    try {
      const response = await fetch("/api/reactions/event/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetId, eventCode }),
      });

      const responseBody = (await response.json()) as
        | { meetId: string; eventCode: string; liked: boolean; count: number }
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in responseBody && responseBody.error
            ? responseBody.error
            : "種目いいねの更新に失敗しました。",
        );
      }

      const body = responseBody as {
        meetId: string;
        eventCode: string;
        liked: boolean;
        count: number;
      };

      setEventLikes((prev) => ({
        ...prev,
        [body.meetId]: {
          ...(prev[body.meetId] ?? {}),
          [body.eventCode]: {
            liked: body.liked,
            count: body.count,
          },
        },
      }));
    } catch (err) {
      setReactionError(
        err instanceof Error ? err.message : "種目いいねの更新に失敗しました。",
      );
    } finally {
      setPendingEventLikes((prev) => {
        const next = { ...prev };
        delete next[eventLikeKey];
        return next;
      });
    }
  };

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold">検索結果</h1>
        <Link href="/" className="text-sm text-blue-700 underline">
          条件を変更する
        </Link>
      </div>

      {loading ? <p>検索中...</p> : null}
      {error ? <p className="rounded bg-red-50 p-3 text-red-700">{error}</p> : null}
      {reactionError ? (
        <p className="mt-3 rounded bg-amber-50 p-3 text-amber-800">{reactionError}</p>
      ) : null}

      {data ? (
        <>
          <div className="mb-6 grid gap-2 rounded border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="font-medium">年度:</span> {data.season === null ? "すべて" : data.season}
            </p>
            <p>
              <span className="font-medium">性別:</span> {GENDER_LABELS[data.gender]}
            </p>
            <p>
              <span className="font-medium">プール長:</span>{" "}
              {data.course === "ANY"
                ? "すべて（短水路・長水路・共通）"
                : formatCourseStandardRecordLabel(data.course)}
            </p>
            {data.course === "ANY" ? (
              <p className="text-xs text-zinc-600 sm:col-span-2">{COURSE_ANY_DESCRIPTION}</p>
            ) : null}
            <p className="sm:col-span-2">
              <span className="font-medium">検索年齢:</span>{" "}
              {data.targetAges.map((value) => formatCompareAgeLabel(value)).join(", ")}
            </p>
          </div>

          <div className="space-y-6">
            {STANDARD_LEVELS.map((level) => {
              const meets = data.results[level];
              const levelSectionKey = [
                level,
                data.gender,
                data.course,
                data.season === null ? "all" : String(data.season),
                data.targetAges.join(","),
              ].join("|");
              return (
                <details
                  key={levelSectionKey}
                  className="rounded border border-zinc-200 bg-white p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold">{LEVEL_LABELS[level]}</h2>
                      <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        {meets.length}件
                      </span>
                    </div>
                  </summary>

                  <div className="mt-3">
                    {meets.length === 0 ? (
                      <p className="text-sm text-zinc-600">該当なし</p>
                    ) : (
                      <div className="space-y-5">
                        {meets.map((meet) => {
                          const eventCodes = Array.from(
                            new Set(meet.items.map((item) => item.event_code)),
                          );
                          const meetLikeStatus = getMeetLikeStatus(meet.meet_id);
                          const meetLikePending = Boolean(pendingMeetLikes[meet.meet_id]);

                          return (
                            <details key={meet.meet_id} className="rounded border border-zinc-200">
                              <summary className="cursor-pointer list-none p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h3 className="text-base font-semibold">{meet.meet_name}</h3>
                                  <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                                    {formatCourseStandardRecordLabel(meet.meet_course)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-zinc-600">
                                  標準記録年度: {meet.meet_season} / 大会日付:{" "}
                                  {formatMeetDateRange(meet.meet_date, meet.meet_date_end)} / 種目数:{" "}
                                  {eventCodes.length}
                                </p>
                                <div className="mt-2 inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      void handleMeetLikeClick(event, meet.meet_id);
                                    }}
                                    disabled={meetLikePending}
                                    className={`rounded border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                      meetLikeStatus.liked
                                        ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                                    }`}
                                  >
                                    {meetLikePending
                                      ? "更新中..."
                                      : meetLikeStatus.liked
                                        ? "いいね済み"
                                        : "いいね"}
                                  </button>
                                  <span className="text-xs text-zinc-600">
                                    {meetLikeStatus.count}件
                                  </span>
                                </div>
                              </summary>
                              <div className="border-t border-zinc-200 p-3">
                                {meet.meet_metadata ? (
                                  <p className="mb-3 mt-1 break-all text-xs text-zinc-600">
                                    metadata: {JSON.stringify(meet.meet_metadata)}
                                  </p>
                                ) : null}
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-zinc-200 text-left">
                                        <th className="py-2 pr-3">種目</th>
                                        <th className="py-2 pr-3">いいね</th>
                                        {data.targetAges.map((targetAge) => (
                                          <th key={`${meet.meet_id}-age-${targetAge}`} className="py-2 pr-3">
                                            {formatCompareAgeLabel(targetAge)}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {eventCodes.map((eventCode) => {
                                        const byAge = new Map<number, string>();
                                        for (const item of meet.items) {
                                          if (item.event_code === eventCode) {
                                            byAge.set(item.age, item.time);
                                          }
                                        }

                                        const eventLikeKey = getEventLikeKey(
                                          meet.meet_id,
                                          eventCode,
                                        );
                                        const eventLikeStatus = getEventLikeStatus(
                                          meet.meet_id,
                                          eventCode,
                                        );
                                        const eventLikePending = Boolean(
                                          pendingEventLikes[eventLikeKey],
                                        );

                                        return (
                                          <tr
                                            key={`${meet.meet_id}-${eventCode}`}
                                            className="border-b border-zinc-100"
                                          >
                                            <td className="py-2 pr-3">
                                              {formatEventCodeLabel(eventCode)}
                                            </td>
                                            <td className="py-2 pr-3">
                                              <div className="inline-flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={(event) => {
                                                    void handleEventLikeClick(
                                                      event,
                                                      meet.meet_id,
                                                      eventCode,
                                                    );
                                                  }}
                                                  disabled={eventLikePending}
                                                  className={`rounded border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                                    eventLikeStatus.liked
                                                      ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                                                  }`}
                                                >
                                                  {eventLikePending
                                                    ? "更新中..."
                                                    : eventLikeStatus.liked
                                                      ? "いいね済み"
                                                      : "いいね"}
                                                </button>
                                                <span className="text-xs text-zinc-600">
                                                  {eventLikeStatus.count}
                                                </span>
                                              </div>
                                            </td>
                                            {data.targetAges.map((targetAge) => (
                                              <td
                                                key={`${meet.meet_id}-${eventCode}-${targetAge}`}
                                                className="py-2 pr-3"
                                              >
                                                {byAge.get(targetAge) ?? "-"}
                                              </td>
                                            ))}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}
