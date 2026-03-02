"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { parseIsoDateOnly } from "@/lib/date";
import { COURSES, GENDERS, type Course } from "@/lib/domain";

type FormValues = {
  gender: "M" | "F";
  birthDate: string;
  course: Course;
  season: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const GENDER_LABELS: Record<FormValues["gender"], string> = {
  M: "男子",
  F: "女子",
};

const COURSE_LABELS: Record<FormValues["course"], string> = {
  SCM: "短水路 (25m)",
  LCM: "長水路 (50m)",
  ANY: "どちらでも良い",
};

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (!values.birthDate) {
    errors.birthDate = "生年月日を入力してください。";
  } else if (!parseIsoDateOnly(values.birthDate)) {
    errors.birthDate = "YYYY-MM-DD 形式で正しい日付を入力してください。";
  }

  if (values.season.trim() !== "") {
    const seasonNumber = Number.parseInt(values.season, 10);
    if (!/^\d{4}$/.test(values.season) || seasonNumber < 1900 || seasonNumber > 3000) {
      errors.season = "年度は4桁の数値で入力してください（例: 2026）。";
    }
  }

  return errors;
}

export function SearchForm() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>({
    gender: "M",
    birthDate: "",
    course: "SCM",
    season: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const hasErrors = useMemo(() => Object.keys(errors).length > 0, [errors]);

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    setErrors(validate(next));
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationErrors = validate(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const query = new URLSearchParams({
      gender: values.gender,
      birthDate: values.birthDate,
      course: values.course,
    });

    if (values.season.trim() !== "") {
      query.set("season", values.season.trim());
    }

    router.push(`/result?${query.toString()}`);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <div>
        <label className="mb-1 block text-sm font-medium">性別</label>
        <select
          value={values.gender}
          onChange={(event) => setField("gender", event.target.value as FormValues["gender"])}
          className="w-full rounded border border-zinc-300 px-3 py-2"
        >
          {GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {GENDER_LABELS[gender]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">生年月日</label>
        <input
          type="date"
          value={values.birthDate}
          onChange={(event) => setField("birthDate", event.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          required
        />
        {errors.birthDate ? <p className="mt-1 text-sm text-red-600">{errors.birthDate}</p> : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">プール</label>
        <select
          value={values.course}
          onChange={(event) => setField("course", event.target.value as FormValues["course"])}
          className="w-full rounded border border-zinc-300 px-3 py-2"
        >
          {COURSES.map((course) => (
            <option key={course} value={course}>
              {COURSE_LABELS[course]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">年度（任意）</label>
        <input
          type="number"
          value={values.season}
          onChange={(event) => setField("season", event.target.value)}
          placeholder="例: 2026"
          className="w-full rounded border border-zinc-300 px-3 py-2"
        />
        <p className="mt-1 text-xs text-zinc-600">未入力の場合は今年度を検索します。</p>
        {errors.season ? <p className="mt-1 text-sm text-red-600">{errors.season}</p> : null}
      </div>

      <button
        type="submit"
        className="w-full rounded bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700"
      >
        検索する
      </button>

      {hasErrors ? <p className="text-sm text-red-700">入力内容を確認してください。</p> : null}
    </form>
  );
}
