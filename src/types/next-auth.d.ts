import "next-auth";
import "next-auth/jwt";
import type { UserRole } from "@/types/technician";

// Re-export so callers can import UserRole from either location.
export type { UserRole };

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email?: string | null;
      role: UserRole;
      tenant_id: string;
      /** For TECHNICIAN role — equals user.id in this schema. */
      technician_id?: string;
      avatar_url?: string | null;
    };
  }

  interface User {
    id: string;
    name?: string | null;
    role: UserRole;
    tenant_id: string;
    technician_id?: string;
    avatar_url?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    name?: string | null;
    role: UserRole;
    tenant_id: string;
    technician_id?: string;
    avatar_url?: string | null;
  }
}
