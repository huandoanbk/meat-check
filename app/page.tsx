"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createSession,
  deleteSession,
  InventorySession,
  loadSessions,
} from "@/lib/storage";

export default function HomePage() {
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSessions(loadSessions());
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = () => {
    const id = createSession();
    setSessions(loadSessions());
    window.location.href = `/check/${id}`;
  };

  const handleDelete = (id: string) => {
    const ok = window.confirm("Delete this session? This cannot be undone.");
    if (!ok) return;
    deleteSession(id);
    setSessions(loadSessions());
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Inventory Check</h1>
          <button
            className="rounded-lg bg-emerald-500 px-4 py-3 text-lg font-semibold text-white shadow-sm hover:bg-emerald-600"
            onClick={handleCreate}
          >
            +
          </button>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent checks</h2>
          {hydrated && sessions.length === 0 ? (
            <p className="text-sm text-slate-600">No sessions yet. Tap + to start.</p>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border-b border-slate-200 px-4 py-3 last:border-b-0"
                >
                  <Link
                    className="flex-1"
                    href={`/check/${s.id}`}
                  >
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-sm text-slate-600">
                      Records: {s.records.length}
                    </div>
                  </Link>
                  <button
                    className="ml-3 rounded-md px-3 py-2 text-sm text-red-600"
                    onClick={() => handleDelete(s.id)}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
