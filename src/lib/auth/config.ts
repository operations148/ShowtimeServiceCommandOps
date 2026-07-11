import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/db/supabase";
import { UserRole } from "@/types/technician";
import { logger, maskEmail } from "@/lib/security/logger";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase();

        // Durable rate limit — 10 attempts per 15 minutes per email
        // (security-audit H1 — no login rate limiting existed at all).
        const limit = await checkRateLimit(email, "login");
        if (!limit.allowed) {
          logger.warn("[auth] login rate limited", { email: maskEmail(email) });
          return null;
        }

        const { data: user, error } = await supabaseAdmin
          .from("users")
          .select("id, email, password_hash, name, role, tenant_id, is_active, avatar_url, session_version")
          .eq("email", email)
          .eq("is_active", true)
          .maybeSingle();

        if (error || !user) {
          logger.warn("[auth] failed login — user not found or inactive", { email: maskEmail(email) });
          return null;
        }

        if (!user.password_hash) {
          logger.warn("[auth] failed login — no password_hash set", { email: maskEmail(email) });
          return null;
        }

        const passwordMatch = await bcrypt.compare(credentials.password, user.password_hash);
        if (!passwordMatch) {
          logger.warn("[auth] failed login — incorrect password", { email: maskEmail(email) });
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
          tenant_id: user.tenant_id,
          // For TECHNICIAN role, the user ID IS the technician ID in this schema
          technician_id: user.role === UserRole.TECHNICIAN ? user.id : undefined,
          avatar_url: user.avatar_url ?? null,
          session_version: (user.session_version as number | null) ?? 1,
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8-hour sessions
  },

  // Explicit (rather than implicit-default) cookie flags — security-audit M10
  // noted the app relied entirely on NextAuth's undocumented defaults.
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id         = user.id;
        token.name       = user.name ?? null;
        token.role       = user.role;
        token.tenant_id  = user.tenant_id;
        token.technician_id = user.technician_id;
        token.avatar_url = user.avatar_url ?? null;
        token.session_version = user.session_version;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id           = token.id;
      session.user.name         = (token.name as string | null) ?? "";
      session.user.role         = token.role;
      session.user.tenant_id    = token.tenant_id;
      session.user.technician_id = token.technician_id;
      session.user.avatar_url   = token.avatar_url ?? null;
      session.user.session_version = token.session_version;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
