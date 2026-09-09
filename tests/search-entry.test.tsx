import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HomeSearchMode } from "@/components/home-search-mode";
import { SearchForm } from "@/components/search-form";
import { COMPARE_AGE_OPTIONS, formatCompareAgeLabel } from "@/lib/compare-age";
import {
  SEARCH_HISTORY_STORAGE_KEY,
  SEARCH_LAST_INPUT_STORAGE_KEY,
} from "@/lib/search-history";

const router = { push: vi.fn(), replace: vi.fn() };

vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  window.history.replaceState({}, "", "/");
});

describe("search entry", () => {
  it("starts with all ages, supports individual changes and restores all with one button", async () => {
    const user = userEvent.setup();
    render(<SearchForm />);

    expect(screen.getByRole("button", { name: "男子" }).getAttribute("aria-pressed")).toBe("true");
    for (const age of COMPARE_AGE_OPTIONS) {
      expect(screen.getByRole("button", { name: formatCompareAgeLabel(age) }).getAttribute("aria-pressed")).toBe("true");
    }
    expect((screen.getByRole("button", { name: "全選択" }) as HTMLButtonElement).disabled).toBe(true);
    for (const age of COMPARE_AGE_OPTIONS) {
      await user.click(screen.getByRole("button", { name: formatCompareAgeLabel(age) }));
    }

    await user.click(screen.getByRole("button", { name: "検索する" }));
    expect(screen.queryByText("年齢を1つ以上選択してください。")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "10歳" }));
    await user.click(screen.getByRole("button", { name: "12歳" }));
    expect(screen.getByRole("button", { name: "10歳" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "12歳" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "全選択" }));
    await user.click(screen.getByRole("button", { name: "検索する" }));
    expect(router.push).toHaveBeenCalledWith("/result?gender=M&targetAges=9%2C10%2C11%2C12%2C13%2C14%2C15%2C16%2C17");
  });

  it("keeps extras and display help closed, then searches with valid conditions", async () => {
    const user = userEvent.setup();
    render(<SearchForm />);

    expect(screen.getByText("選手名・履歴").closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("表示について").closest("details")?.hasAttribute("open")).toBe(false);

    await user.click(screen.getByRole("button", { name: "女子" }));
    await user.click(screen.getByRole("button", { name: "13歳" }));
    await user.click(screen.getByRole("button", { name: "検索する" }));

    expect(router.push).toHaveBeenCalledWith("/result?gender=F&targetAges=9%2C10%2C11%2C12%2C14%2C15%2C16%2C17");
  });

  it("uses a saved history course when restoring a history search", async () => {
    window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify([{
      playerName: "佐藤",
      gender: "F",
      course: "LCM",
      season: "2025",
      targetAges: [12],
      searchedAt: "2026-09-09T01:00:00.000Z",
    }]));
    const user = userEvent.setup();
    render(<SearchForm />);

    await user.click(screen.getByText("選手名・履歴"));
    const history = await screen.findByRole("button", { name: /佐藤 \/ 女子 \/ 12歳/ });
    await user.click(history);

    expect(router.push).toHaveBeenCalledWith("/result?gender=F&targetAges=12&course=LCM");
  });

  it("redirects an eligible saved search and preserves its course", async () => {
    window.localStorage.setItem(SEARCH_LAST_INPUT_STORAGE_KEY, JSON.stringify({
      playerName: "",
      gender: "M",
      course: "SCM",
      season: "",
      targetAges: [11, 12],
    }));
    render(<HomeSearchMode />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/result?gender=M&targetAges=11%2C12&course=SCM");
    });
  });

  it("prefers explicit URL conditions over saved conditions", async () => {
    window.localStorage.setItem(SEARCH_LAST_INPUT_STORAGE_KEY, JSON.stringify({
      playerName: "",
      gender: "M",
      course: "LCM",
      season: "",
      targetAges: [11],
    }));
    window.history.replaceState({}, "", "/?gender=F&course=SCM&targetAges=12");
    render(<HomeSearchMode />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/result?gender=F&course=SCM&targetAges=12");
    });
  });

  it("remains searchable when local storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    const user = userEvent.setup();
    render(<HomeSearchMode />);

    await user.click(screen.getByRole("button", { name: "14歳" }));
    await user.click(screen.getByRole("button", { name: "検索する" }));
    expect(router.push).toHaveBeenCalledWith("/result?gender=M&targetAges=9%2C10%2C11%2C12%2C13%2C15%2C16%2C17");
    vi.restoreAllMocks();
  });
});
