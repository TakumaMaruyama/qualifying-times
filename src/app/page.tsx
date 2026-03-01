import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-bold">標準記録検索アプリ</h1>
      <p className="mb-6 text-sm text-zinc-700">
        性別・生年月日・競技会日・短水路/長水路から、全国レベル/九州レベル/県レベルの標準記録を検索します。
      </p>
      <SearchForm />
    </main>
  );
}
