"use client";

import { useEffect, useMemo, useState } from "react";

import { COURSES, STANDARD_LEVELS, type Course, type StandardLevel } from "@/lib/domain";

type PreviewResponse = {
  meet: {
    id: string | null;
    level: StandardLevel;
    season: number;
    course: Course;
    name: string;
    metadata: Record<string, unknown> | null;
    exists: boolean;
  };
  source: {
    title: string;
    url: string | null;
    pages: number[] | null;
  } | null;
  normalizedRows: Array<{
    rowIndex: number;
    gender: "M" | "F";
    age_min: number;
    age_max: number;
    event_code: string;
    time: string;
    time_ms: number;
    status: "add" | "update" | "skip";
  }>;
  errors: Array<{ rowIndex: number | null; message: string }>;
  counts: {
    total: number;
    add: number;
    update: number;
    skip: number;
    error: number;
  };
};

type ImportResponse = {
  meetId: string | null;
  counts: {
    total: number;
    add: number;
    update: number;
    skip: number;
    error: number;
  };
  errors: Array<{ rowIndex: number | null; message: string }>;
  sourceId: string | null;
};

const LEVEL_LABELS: Record<StandardLevel, string> = {
  national: "全国レベル",
  kyushu: "九州レベル",
  kagoshima: "県レベル",
};

const STATUS_LABELS = {
  add: "追加",
  update: "更新",
  skip: "スキップ",
} as const;

const SAMPLE_JSON = `{
  "source": {"title":"sample","url":null,"pages":null},
  "rows":[
    {"gender":"M","age_min":11,"age_max":12,"event_code":"FR_50","time":"29.80"},
    {"gender":"M","age_min":11,"age_max":12,"event_code":"FR_100","time":"1:05.20"},
    {"gender":"F","age_min":13,"age_max":14,"event_code":"IM_200","time":"2:28.50"}
  ]
}`;

function parseMetadataText(text: string): {
  value: Record<string, unknown> | null;
  error: string | null;
} {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { value: null, error: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        value: null,
        error: "metadata は JSONオブジェクトで入力してください（例: {\"category\":\"県予選\"}）。",
      };
    }

    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return {
      value: null,
      error: "metadata のJSON形式が不正です。",
    };
  }
}

export function AdminImportClient() {
  const [sessionReady, setSessionReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [level, setLevel] = useState<StandardLevel>("national");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [course, setCourse] = useState<Course>("SCM");
  const [meetName, setMeetName] = useState("サンプル大会");
  const [meetMetadataText, setMeetMetadataText] = useState("");
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);

  const [requestLoading, setRequestLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch("/api/admin/session");
        const body = (await response.json()) as { authenticated?: boolean };
        setAuthenticated(Boolean(body.authenticated));
      } catch {
        setAuthenticated(false);
      } finally {
        setSessionReady(true);
      }
    };

    loadSession();
  }, []);

  const seasonError = useMemo(() => {
    const seasonNumber = Number.parseInt(season, 10);
    if (!/^\d{4}$/.test(season) || seasonNumber < 1900 || seasonNumber > 3000) {
      return "年度は4桁の数値で入力してください。";
    }
    return null;
  }, [season]);

  const meetNameError = useMemo(() => {
    if (meetName.trim() === "") {
      return "大会名は必須です。";
    }
    return null;
  }, [meetName]);

  const metadataInput = useMemo(() => parseMetadataText(meetMetadataText), [meetMetadataText]);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "ログインに失敗しました。");
      }

      setAuthenticated(true);
      setPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "ログインに失敗しました。");
    } finally {
      setLoginLoading(false);
    }
  };

  const runAction = async (action: "preview" | "import") => {
    if (seasonError) {
      setActionError(seasonError);
      return;
    }

    if (meetNameError) {
      setActionError(meetNameError);
      return;
    }

    if (metadataInput.error) {
      setActionError(metadataInput.error);
      return;
    }

    if (jsonText.trim() === "") {
      setActionError("JSONを入力してください。");
      return;
    }

    setActionError(null);
    setImportResult(null);
    setRequestLoading(true);

    try {
      const response = await fetch(`/api/admin/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          level,
          season: Number.parseInt(season, 10),
          course,
          meetName: meetName.trim(),
          meetMetadata: metadataInput.value,
          jsonText,
        }),
      });

      const body = (await response.json()) as
        | (PreviewResponse & { error?: string })
        | (ImportResponse & { error?: string })
        | { error?: string };

      if (response.status === 401) {
        setAuthenticated(false);
        throw new Error("認証が切れました。再ログインしてください。");
      }

      if (!response.ok) {
        throw new Error(body.error ?? "処理に失敗しました。");
      }

      if (action === "preview") {
        setPreview(body as PreviewResponse);
      } else {
        setImportResult(body as ImportResponse);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "処理に失敗しました。");
    } finally {
      setRequestLoading(false);
    }
  };

  if (!sessionReady) {
    return <p>読み込み中...</p>;
  }

  if (!authenticated) {
    return (
      <form onSubmit={login} className="max-w-md space-y-4 rounded border border-zinc-200 bg-white p-6">
        <h1 className="text-xl font-bold">管理ログイン</h1>
        <div>
          <label className="mb-1 block text-sm font-medium">ADMIN_PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            required
          />
        </div>
        {loginError ? <p className="text-sm text-red-700">{loginError}</p> : null}
        <button
          type="submit"
          disabled={loginLoading}
          className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {loginLoading ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded border border-zinc-200 bg-white p-6">
        <h1 className="text-xl font-bold">標準記録インポート</h1>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">level</label>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as StandardLevel)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              {STANDARD_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {value} ({LEVEL_LABELS[value]})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">season</label>
            <input
              type="number"
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            />
            {seasonError ? <p className="mt-1 text-xs text-red-700">{seasonError}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">course</label>
            <select
              value={course}
              onChange={(event) => setCourse(event.target.value as Course)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              {COURSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">大会名</label>
          <input
            type="text"
            value={meetName}
            onChange={(event) => setMeetName(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            placeholder="例: 2026県春季記録会"
            required
          />
          {meetNameError ? <p className="mt-1 text-xs text-red-700">{meetNameError}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">metadata(JSON, 任意)</label>
          <textarea
            value={meetMetadataText}
            onChange={(event) => setMeetMetadataText(event.target.value)}
            className="h-24 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-xs"
            placeholder='{"category":"県予選","venue":"鹿児島市"}'
          />
          {metadataInput.error ? <p className="mt-1 text-xs text-red-700">{metadataInput.error}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">JSON</label>
          <textarea
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            className="h-64 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-xs"
          />
        </div>

        {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runAction("preview")}
            disabled={requestLoading}
            className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          >
            解析（プレビュー）
          </button>
          <button
            type="button"
            onClick={() => runAction("import")}
            disabled={requestLoading}
            className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
          >
            確定して登録
          </button>
        </div>
      </section>

      {preview ? (
        <section className="space-y-4 rounded border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">プレビュー結果</h2>
          <p className="text-sm">
            対象大会: {preview.meet.name}（{LEVEL_LABELS[preview.meet.level]} / {preview.meet.season} /
            {preview.meet.course}）
          </p>
          <p className="text-sm">大会の状態: {preview.meet.exists ? "既存大会を更新" : "新規大会を作成"}</p>
          <p className="text-sm">
            追加: {preview.counts.add} / 更新: {preview.counts.update} / スキップ: {preview.counts.skip} /
            エラー: {preview.counts.error}
          </p>

          {preview.errors.length > 0 ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-red-700">エラー</h3>
              <ul className="space-y-1 text-sm text-red-700">
                {preview.errors.map((error, index) => (
                  <li key={`${error.rowIndex}-${index}`}>
                    rows[{error.rowIndex ?? "-"}] {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left">
                  <th className="py-2 pr-3">rows[index]</th>
                  <th className="py-2 pr-3">gender</th>
                  <th className="py-2 pr-3">age_min</th>
                  <th className="py-2 pr-3">age_max</th>
                  <th className="py-2 pr-3">event_code</th>
                  <th className="py-2 pr-3">time</th>
                  <th className="py-2">status</th>
                </tr>
              </thead>
              <tbody>
                {preview.normalizedRows.map((row) => (
                  <tr key={row.rowIndex} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">{row.rowIndex}</td>
                    <td className="py-2 pr-3">{row.gender}</td>
                    <td className="py-2 pr-3">{row.age_min}</td>
                    <td className="py-2 pr-3">{row.age_max}</td>
                    <td className="py-2 pr-3">{row.event_code}</td>
                    <td className="py-2 pr-3">{row.time}</td>
                    <td className="py-2">{STATUS_LABELS[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {importResult ? (
        <section className="rounded border border-emerald-300 bg-emerald-50 p-6 text-sm">
          <h2 className="mb-2 text-lg font-semibold">登録結果</h2>
          <p>
            追加: {importResult.counts.add} / 更新: {importResult.counts.update} / スキップ:
            {importResult.counts.skip} / エラー: {importResult.counts.error}
          </p>
        </section>
      ) : null}
    </div>
  );
}
