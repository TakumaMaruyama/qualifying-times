import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ResultSearch } from "@/components/result-client";
import { SEARCH_HISTORY_STORAGE_KEY, SEARCH_LAST_INPUT_STORAGE_KEY } from "@/lib/search-history";
import { STANDARD_VIEW_PREFERENCES_STORAGE_KEY } from "@/lib/standard-view-preferences";

type Level = "national" | "kyushu" | "kagoshima";
type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function response({
  gender = "M",
  targetAges = [11],
  overrides = {},
}: { gender?: "M" | "F"; targetAges?: number[]; overrides?: Partial<Record<Level, ReturnType<typeof meet>[]>> } = {}) {
  return {
    targetAges, gender, course: "ANY", season: null,
    results: {
      national: [],
      kyushu: [],
      kagoshima: [],
      ...overrides,
    },
  };
}

const meet = (level: Level, course: "ANY" | "LCM" | "SCM", time: string, age = 11, name = "全国大会") => ({
  meet_id: `${level}-${course}`, meet_name: name, meet_season: 2026, meet_course: course,
  items: [{ event_code: "FR_50", age, time }],
});

function Harness({ initial = "gender=M&targetAges=11" }: { initial?: string }) {
  const [query, setQuery] = useState(initial);
  return <ResultSearch query={query} onQueryChange={setQuery} />;
}

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => data } as Response);
}

describe("result search", () => {
  it("groups a meet, opens its first result, restores an available saved course, and switches courses", async () => {
    window.localStorage.setItem(STANDARD_VIEW_PREFERENCES_STORAGE_KEY, JSON.stringify({
      level: "national", meetByLevel: { national: "national:全国大会" }, courseByMeet: { "national:全国大会": "SCM" },
    }));
    vi.stubGlobal("fetch", vi.fn<FetchMock>(() => json(response({ overrides: { national: [meet("national", "LCM", "1:01.23"), meet("national", "SCM", "59.87")] } }))));
    const user = userEvent.setup();
    render(<Harness />);

    expect((await screen.findByRole("button", { name: /全国大会/ })).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("59.87")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "長水路" }));
    expect(screen.getByText("1:01.23")).not.toBeNull();
  });

  it("shows the selected region's no-match state", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchMock>(() => json(response({ overrides: { national: [meet("national", "LCM", "59.87")] } }))));
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText("59.87");
    await user.click(screen.getByRole("button", { name: /九州\s*0大会/ }));
    expect(screen.getByRole("status").textContent).toContain("九州には、選択した性別・年齢に該当する標準記録がありません。");
  });

  it("hides the displayed result on condition change and keeps the newest response after an older request finishes late", async () => {
    let resolveSecond: ((value: Response) => void) | undefined;
    let resolveThird: ((value: Response) => void) | undefined;
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn<FetchMock>((_url, init) => {
      signals.push(init?.signal as AbortSignal);
      if (signals.length === 1) return json(response({ gender: "M", targetAges: [11], overrides: { national: [meet("national", "LCM", "31.11")] } }));
      if (signals.length === 2) return new Promise<Response>((resolve) => { resolveSecond = resolve; });
      return new Promise<Response>((resolve) => { resolveThird = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness initial="gender=M&targetAges=11" />);
    await screen.findByText("31.11");
    await user.click(screen.getByRole("button", { name: "女子" }));
    expect(signals[0]?.aborted).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("標準記録を読み込み中");
    expect(screen.queryByText("31.11")).toBeNull();
    await user.click(screen.getByRole("button", { name: "12歳" }));
    expect(signals[1]?.aborted).toBe(true);
    await act(async () => {
      resolveThird?.({ ok: true, json: async () => response({ gender: "F", targetAges: [11, 12], overrides: { national: [meet("national", "LCM", "33.33", 11)] } }) } as Response);
      await Promise.resolve();
    });
    expect(await screen.findByText("33.33")).not.toBeNull();
    await act(async () => {
      resolveSecond?.({ ok: true, json: async () => response({ gender: "F", targetAges: [11], overrides: { national: [meet("national", "LCM", "32.22")] } }) } as Response);
      await Promise.resolve();
    });
    expect(screen.queryByText("32.22")).toBeNull();
    expect(screen.getByText("33.33")).not.toBeNull();
  });

  it("does not fetch with no selected ages, then retries a failed request", async () => {
    const fetchMock = vi.fn<FetchMock>()
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockImplementationOnce(() => json(response({ overrides: { national: [meet("national", "LCM", "58.22")] } })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness initial="gender=M&targetAges=" />);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "11歳" }));
    await screen.findByRole("button", { name: "再試行する" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "再試行する" }));
    expect(await screen.findByText("58.22")).not.toBeNull();
  });

  it("removes a displayed table without another request when every age is cleared", async () => {
    const fetchMock = vi.fn<FetchMock>(() => json(response({ overrides: { national: [meet("national", "LCM", "31.11")] } })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText("31.11");
    await user.click(screen.getByRole("button", { name: "11歳" }));
    expect(screen.queryByText("31.11")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("年齢を1つ以上選ぶと");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("restores a saved course when the URL has no conditions and lets a history item re-search", async () => {
    window.localStorage.setItem(SEARCH_LAST_INPUT_STORAGE_KEY, JSON.stringify({ playerName: "保存名", gender: "F", course: "SCM", season: "", targetAges: [12] }));
    window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify([{
      playerName: "履歴選手", gender: "M", course: "LCM", season: "", targetAges: [13], searchedAt: "2026-09-09T00:00:00.000Z",
    }]));
    const fetchMock = vi.fn<FetchMock>(() => json(response({ gender: "F", targetAges: [12], overrides: { national: [meet("national", "SCM", "59.87", 12)] } })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness initial="" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ gender: "F", course: "SCM", targetAges: [12] });
    await user.click(screen.getByText("選手名・履歴"));
    await user.click(screen.getByRole("button", { name: /履歴選手 \/ 男子 \/ 13歳/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/search", expect.objectContaining({ body: expect.stringContaining('"targetAges":[13]') })));
  });

  it("falls back from a removed saved meet and course to the first available LCM result, then persists the fallback", async () => {
    window.localStorage.setItem(STANDARD_VIEW_PREFERENCES_STORAGE_KEY, JSON.stringify({
      level: "kyushu", meetByLevel: { kyushu: "kyushu:廃止大会" }, courseByMeet: { "kyushu:廃止大会": "SCM" },
    }));
    vi.stubGlobal("fetch", vi.fn<FetchMock>(() => json(response({ overrides: { kyushu: [meet("kyushu", "LCM", "31.11", 11, "新大会")] } }))));
    render(<Harness />);
    await screen.findByText("31.11");
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(STANDARD_VIEW_PREFERENCES_STORAGE_KEY) ?? "{}")).toMatchObject({
        level: "kyushu", meetByLevel: { kyushu: "kyushu:新大会" }, courseByMeet: { "kyushu:新大会": "LCM" },
      });
    });
  });

  it("still searches when local storage throws on reads and writes", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
    const fetchMock = vi.fn<FetchMock>(() => json(response({ overrides: { national: [meet("national", "LCM", "31.11")] } })));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    expect(await screen.findByText("31.11")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
