"use client";

import type { ChecklistItem } from "@/types/visit";

/**
 * Per-visit draft persistence (Phase 8, ADR-0015 §2). Checklist + notes are
 * saved locally the instant they change and restored on load, so a dropped
 * connection / backgrounded tab / killed app never costs a technician the work
 * they just did. Draft = local UNSYNCED edits; it is cleared once a save is
 * confirmed by the server.
 *
 * localStorage (not IndexedDB) on purpose: drafts are tiny text, synchronous
 * access is simpler, and it survives reloads. The (de)serialize helpers are
 * pure and unit-tested; the read/write wrappers are thin and SSR-safe.
 */

const PREFIX = "serviceops.visitDraft.";

export interface VisitDraft {
  visitId: string;
  checklist: ChecklistItem[];
  notes: string;
  updatedAt: number;
}

export function draftKey(visitId: string): string {
  return `${PREFIX}${visitId}`;
}

/** Pure. */
export function serializeDraft(draft: VisitDraft): string {
  return JSON.stringify(draft);
}

/** Pure. Returns null for missing/corrupt/shape-invalid input (never throws). */
export function parseDraft(raw: string | null | undefined): VisitDraft | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<VisitDraft>;
    if (
      !obj ||
      typeof obj.visitId !== "string" ||
      !Array.isArray(obj.checklist) ||
      typeof obj.notes !== "string" ||
      typeof obj.updatedAt !== "number"
    ) {
      return null;
    }
    return { visitId: obj.visitId, checklist: obj.checklist as ChecklistItem[], notes: obj.notes, updatedAt: obj.updatedAt };
  } catch {
    return null;
  }
}

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function saveDraft(visitId: string, checklist: ChecklistItem[], notes: string, now = Date.now()): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(draftKey(visitId), serializeDraft({ visitId, checklist, notes, updatedAt: now }));
  } catch {
    /* quota / private mode — drafts are best-effort */
  }
}

export function loadDraft(visitId: string): VisitDraft | null {
  if (!hasStorage()) return null;
  try {
    return parseDraft(window.localStorage.getItem(draftKey(visitId)));
  } catch {
    return null;
  }
}

export function clearDraft(visitId: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(draftKey(visitId));
  } catch {
    /* ignore */
  }
}
