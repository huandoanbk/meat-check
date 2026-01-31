"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

  useEffect(() => {
    setSessions(loadSessions());
    setHydrated(true);
  }, []);
  const [openScan, setOpenScan] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualProductId, setManualProductId] = useState("");
  const [manualKg, setManualKg] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showReportMenu, setShowReportMenu] = useState(false);

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

  const buildSummaryLines = () =>
    summary.map((s) => {
      const label = s.productId ? `[${s.productId}] ${s.productName}` : s.productName;
      return `${label}: ${s.totalKg.toFixed(3)} kg (${s.count})`;
    });

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

  const sanitizeFilename = (name: string, ext: string) => {
    const safe = name.replace(/[<>:"/\\|?*\r\n]+/g, "_").trim() || "report";
    return `${safe}.${ext}`;
  };

  const copySummary = async () => {
    if (!summary.length) return;
    const lines = buildSummaryLines();
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setToast("Copied");
    } catch {
      setToast("Failed to copy");
    } finally {
      setShowReportMenu(false);
      setTimeout(() => setToast(null), 2000);
    }
  };

  const exportCsv = () => {
    if (!session || !summary.length) return;
    const rows = [["product_id", "product_name", "total_kg", "record_count"]];
    summary.forEach((s) => {
      rows.push([
        s.productId,
        s.productName,
        s.totalKg.toFixed(3),
        String(s.count),
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizeFilename(session.name, "csv");
    link.click();
    URL.revokeObjectURL(url);
    setShowReportMenu(false);
    setToast("CSV exported");
    setTimeout(() => setToast(null), 2000);
  };

  const exportPdf = async () => {
    if (!session || !summary.length) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Session: ${session.name}`, 40, 40);
    const head = [["Product", "Total (kg)", "Count"]];
    const body = summary.map((s) => [
      s.productId ? `[${s.productId}] ${s.productName}` : s.productName,
      s.totalKg.toFixed(3),
      String(s.count),
    ]);
    autoTable(doc, {
      head,
      body,
      startY: 60,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    doc.save(sanitizeFilename(session.name, "pdf"));
    setShowReportMenu(false);
    setToast("PDF exported");
    setTimeout(() => setToast(null), 2000);
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
          <div className="text-lg font-semibold">{session.name}</div>
          <div className="ml-auto flex gap-2">
            <button
              className="rounded-md bg-emerald-500 px-6 py-3 text-white shadow-sm flex-1 min-w-[140px]"
              onClick={() => setOpenScan(true)}
            >
              Scan
            </button>
            <button
              className="rounded-md bg-slate-900 px-3 py-3 text-white shadow-sm"
              onClick={() => setShowManual((v) => !v)}
            >
              + Add manual
            </button>
            <div className="relative">
              <button
                className="rounded-md bg-indigo-500 px-3 py-3 text-white shadow-sm h-full"
                onClick={() => setShowReportMenu(true)}
              >
                Report
              </button>
              {showReportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowReportMenu(false)}
                  />
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg">
                    <button
                      className="block w-full px-4 py-3 text-left text-sm hover:bg-slate-100"
                      onClick={() => {
                        copySummary();
                        setShowReportMenu(false);
                      }}
                    >
                      Copy summary
                    </button>
                    <button
                      className="block w-full px-4 py-3 text-left text-sm hover:bg-slate-100"
                      onClick={() => {
                        exportCsv();
                        setShowReportMenu(false);
                      }}
                    >
                      Export CSV
                    </button>
                    <button
                      className="block w-full px-4 py-3 text-left text-sm hover:bg-slate-100"
                      onClick={() => {
                        exportPdf();
                        setShowReportMenu(false);
                      }}
                    >
                      Export PDF
                    </button>
                  </div>
                </>
              )}
            </div>
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
                  style={{ fontSize: "16px" }}
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
                    {label}: {s.totalKg.toFixed(3)} kg ({s.count})
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
