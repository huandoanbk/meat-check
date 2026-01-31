"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ScanModal } from "@/components/ScanModal";
import { PRODUCTS } from "@/lib/products";
import {
  addRecord,
  deleteRecord,
  InventorySession,
  loadSessions,
  ScanRecord,
  uid,
} from "@/lib/storage";

export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();

  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSessions(loadSessions());
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [openScan, setOpenScan] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualProductId, setManualProductId] = useState("");
  const [manualKg, setManualKg] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const session = useMemo(
    () => sessions.find((s) => s.id === sessionId),
    [sessions, sessionId]
  );

  const handleAddRecord = (data: Omit<ScanRecord, "id" | "ts">) => {
    if (!session) return;
    const record: ScanRecord = {
      ...data,
      id: uid(),
      ts: Date.now(),
    };
    const next = addRecord(session.id, record);
    setSessions(next);
  };

  const handleDeleteRecord = (recordId: string) => {
    if (!session) return;
    const ok = window.confirm("Delete this record?");
    if (!ok) return;
    const next = deleteRecord(session.id, recordId);
    setSessions(next);
  };

  const summary = useMemo(() => {
    if (!session) return [];
    const map = new Map<
      string,
      { productId: string; productName: string; totalKg: number; count: number }
    >();
    for (const r of session.records) {
      const key = r.productId;
      const existing = map.get(key) ?? {
        productId: r.productId,
        productName: r.productName,
        totalKg: 0,
        count: 0,
      };
      existing.totalKg += r.kg;
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [session]);

  const handleManualAdd = () => {
    if (!session) return;
    const kg = parseFloat(manualKg.replace(",", "."));
    if (!manualProductId || !Number.isFinite(kg) || kg <= 0) return;
    const product = PRODUCTS.find((p) => p.id === manualProductId);
    if (!product) return;
    handleAddRecord({
      productId: product.id,
      productName: product.name,
      kg,
      source: "manual",
    });
    setManualKg("");
    setManualProductId("");
    setShowManual(false);
  };

  const handleCopyReport = async () => {
    if (!session || !summary.length) return;
    const lines = summary.map((s) => {
      const label = s.productId ? `[${s.productId}] ${s.productName}` : s.productName;
      return `${label}: ${s.totalKg.toFixed(3)} kg (${s.count})`;
    });
    const text = [`Session: ${session.name}`, "Summary:", ...lines].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setToast("Report copied");
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast("Failed to copy");
      setTimeout(() => setToast(null), 2000);
    }
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
          <div className="text-sm text-slate-600">Loading...</div>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
          <h1 className="text-2xl font-semibold">Session not found</h1>
          <Link
            href="/"
            className="rounded-md bg-emerald-500 px-4 py-2 text-white"
          >
            Home
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onClick={() => router.back()}
          >
            ← Back
          </button>
          <Link
            href="/"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            Home
          </Link>
          <div className="text-lg font-semibold">{session.name}</div>
          <div className="ml-auto flex gap-2">
            <button
              className="rounded-md bg-emerald-500 px-3 py-2 text-white shadow-sm"
              onClick={() => setOpenScan(true)}
            >
              Scan
            </button>
            <button
              className="rounded-md bg-slate-900 px-3 py-2 text-white shadow-sm"
              onClick={() => setShowManual((v) => !v)}
            >
              + Add manual
            </button>
            <button
              className="rounded-md bg-indigo-500 px-3 py-2 text-white shadow-sm"
              onClick={handleCopyReport}
            >
              Report
            </button>
          </div>
        </header>

        <div className="text-sm text-slate-700">Records: {session.records.length}</div>

        {showManual && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Add manual</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-sm">Product</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={manualProductId}
                  onChange={(e) => setManualProductId(e.target.value)}
                >
                  <option value="">Choose product</option>
                  {PRODUCTS.map((p) => {
                    const label = p.id ? `[${p.id}] ${p.name}` : p.name;
                    return (
                      <option key={p.id} value={p.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="text-sm">Weight (kg)</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={manualKg}
                  onChange={(e) => setManualKg(e.target.value)}
                  placeholder="0.000"
                  inputMode="decimal"
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-md bg-slate-200 px-3 py-2 text-sm"
                  onClick={() => setShowManual(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-md bg-emerald-500 px-3 py-2 text-sm text-white disabled:bg-slate-300"
                  onClick={handleManualAdd}
                  disabled={!manualProductId || !manualKg}
                >
                  Add
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Summary</h2>
          {summary.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No data yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {summary.map((s) => {
                const label = s.productId ? `[${s.productId}] ${s.productName}` : s.productName;
                return (
                  <div key={s.productId || s.productName} className="text-sm">
                    <span className="font-semibold">{label}</span> —{" "}
                    {s.totalKg.toFixed(3)} kg ({s.count})
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Details</h2>
          {session.records.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No records yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {session.records.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {r.productId ? `[${r.productId}] ` : ""}
                      {r.productName}
                    </div>
                    <div className="text-sm text-slate-700">
                      {r.kg.toFixed(3)} kg
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(r.ts).toLocaleString()} • {r.source}
                    </div>
                  </div>
                  <button
                    className="text-sm text-red-600"
                    onClick={() => handleDeleteRecord(r.id)}
                  >
                    X
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <ScanModal
        open={openScan}
        onClose={() => setOpenScan(false)}
        products={PRODUCTS}
        onConfirmRecord={(record) =>
          handleAddRecord({ ...record, source: "ocr" })
        }
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-black px-4 py-2 text-sm text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
