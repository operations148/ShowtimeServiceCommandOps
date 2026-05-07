import React from "react";
import { cn } from "@/lib/utils";

function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-100", className)} style={style} />;
}

// ── Table row skeleton ────────────────────────────────────────────────────────

interface LoadingRowsProps {
  rows?: number;
  cols?: number;
}

export function LoadingRows({ rows = 5, cols = 4 }: LoadingRowsProps) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Bone className="h-3 w-16 shrink-0" />
          {Array.from({ length: cols - 2 }, (__, j) => (
            <Bone
              key={j}
              className={cn("h-3 flex-1", j % 2 === 0 ? "max-w-[200px]" : "max-w-[120px]")}
            />
          ))}
          <Bone className="h-5 w-20 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Stat card skeleton ────────────────────────────────────────────────────────

export function LoadingCard() {
  return (
    <div className="rounded-xl border border-border border-t-2 border-t-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Bone className="h-2.5 w-20" />
          <Bone className="h-8 w-12" />
          <Bone className="h-2.5 w-28" />
        </div>
        <Bone className="h-10 w-10 shrink-0 rounded-lg" />
      </div>
    </div>
  );
}

// ── Generic bar row skeleton (for charts / status breakdowns) ─────────────────

export function LoadingBarRow() {
  return (
    <div className="flex items-center gap-3">
      <Bone className="h-2 w-2 shrink-0 rounded-full" />
      <Bone className="h-2.5 w-24 shrink-0" />
      <Bone className="h-1.5 flex-1 rounded-full" />
      <Bone className="h-2.5 w-4 shrink-0" />
    </div>
  );
}

// ── Table-body skeleton (for use inside <TableBody>) ──────────────────────────

import {
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface LoadingTableRowsProps {
  rows?: number;
  cols?: number;
}

export function LoadingTableRows({ rows = 5, cols = 6 }: LoadingTableRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }, (__, j) => (
            <TableCell key={j}>
              <Bone
                className="h-3"
                style={{ width: `${55 + ((i + j) % 3) * 20}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
