import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/api-auth";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/settings/release
//
// AUTHENTICATED (canManageSettings). Answers "which commit is actually
// running in production right now?"
//
// Why this exists: during this incident the deployed commit could not be
// established at all. Production is deployed manually with `vercel --prod`,
// which uploads the local working tree and attaches NO git metadata, so
// Vercel's own API could not report a SHA either. That turned a simple
// question into an unanswerable one for the whole investigation.
//
// This endpoint reports provenance when it is available AND says so plainly
// when it is not, rather than implying certainty. `provenance: "unavailable"`
// is itself the diagnostic signal: it means the running build was deployed by
// a method that records no commit, so nobody can prove what is live.
//
// Authenticated on purpose: build identifiers are deployment internals and
// must not be handed to unauthenticated callers.
// Contains no secrets — only commit/build identifiers and environment name.
// ---------------------------------------------------------------------------

type Provenance = "git" | "ci" | "unavailable";

export async function GET() {
  const auth = await requirePermission("canManageSettings");
  if (!auth.ok) return auth.response;

  // Vercel populates these only for git-connected deployments.
  const vercelSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim();
  const vercelRef = (process.env.VERCEL_GIT_COMMIT_REF ?? "").trim();
  // Injected at build time by CI when a build SHA is stamped explicitly.
  const buildSha = (process.env.NEXT_PUBLIC_BUILD_SHA ?? "").trim();

  const sha = vercelSha || buildSha;
  const provenance: Provenance = vercelSha ? "git" : buildSha ? "ci" : "unavailable";

  return NextResponse.json({
    data: {
      provenance,
      commitSha: sha || null,
      commitShaShort: sha ? sha.slice(0, 12) : null,
      branch: vercelRef || null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      // Actionable guidance rather than a bare null, so an operator seeing
      // "unavailable" knows why and what to change.
      note:
        provenance === "unavailable"
          ? "No commit recorded for this build. It was deployed by a method that attaches no git metadata (e.g. a manual `vercel --prod` upload). Deploy from git, or set NEXT_PUBLIC_BUILD_SHA at build time, to make releases identifiable."
          : null,
    },
  });
}
