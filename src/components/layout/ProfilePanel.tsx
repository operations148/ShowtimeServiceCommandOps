"use client";

import { useRef, useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { Camera, LogOut, X, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
  onAvatarUpdated: (url: string | null) => void;
  avatarOverride: string | null;
}

export function ProfilePanel({ open, onClose, onAvatarUpdated, avatarOverride }: ProfilePanelProps) {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = session?.user?.name ?? "User";
  const email = session?.user?.email ?? "";
  const role = (session?.user?.role ?? "").replace(/_/g, " ").toLowerCase();
  const avatarUrl = avatarOverride ?? session?.user?.avatar_url ?? null;

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const json = (await res.json()) as { data?: { url: string }; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
      } else if (json.data?.url) {
        onAvatarUpdated(json.data.url);
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (res.ok) {
        onAvatarUpdated(null);
      } else {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "Failed to remove avatar");
      }
    } catch {
      setError("Failed to remove avatar. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-xl",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-label="Profile"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <span className="text-sm font-semibold text-slate-900">My Profile</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Avatar section */}
        <div className="flex flex-col items-center gap-3 px-5 py-6 border-b border-slate-100">
          <div className="relative">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white overflow-hidden ring-4 ring-white shadow-md">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={name}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              ) : (
                initials
              )}
            </div>
            {/* Camera button overlay */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || removing}
              className={cn(
                "absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full",
                "bg-brand-600 text-white shadow-sm ring-2 ring-white",
                "transition-colors hover:bg-brand-700 disabled:opacity-50"
              )}
              aria-label="Change avatar"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handleFileChange}
          />

          <div className="text-center">
            <p className="text-sm font-semibold text-slate-900">{name}</p>
            <p className="text-xs text-slate-500 capitalize">{role}</p>
            {email && <p className="mt-0.5 text-xs text-slate-400">{email}</p>}
          </div>

          {/* Upload hint / error */}
          {error && (
            <p className="text-center text-xs text-red-600">{error}</p>
          )}
          {!error && (
            <p className="text-center text-[11px] text-slate-400">
              JPEG, PNG or WebP · max 5 MB
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 px-3 py-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || removing}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700",
              "transition-colors hover:bg-slate-50 disabled:opacity-50"
            )}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <Camera className="h-4 w-4 text-slate-400" />
            )}
            {uploading ? "Uploading…" : "Change photo"}
          </button>

          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading || removing}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600",
                "transition-colors hover:bg-red-50 disabled:opacity-50"
              )}
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {removing ? "Removing…" : "Remove photo"}
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer — sign out */}
        <div className="border-t border-slate-100 px-3 py-3">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600",
              "transition-colors hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <LogOut className="h-4 w-4 text-slate-400" />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
