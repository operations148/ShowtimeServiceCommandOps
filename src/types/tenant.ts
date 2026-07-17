// Tenant Types

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ghl_location_id?: string;
  /**
   * @deprecated INERT — never read or written (ADR-0017). The product uses a
   * single shared GHL token (env `GHL_PRIVATE_INTEGRATION_TOKEN`), not per-tenant
   * credentials. Do not use until a real multi-tenant encrypted-credential
   * design lands. Kept, not dropped, so that work can adopt it.
   */
  ghl_api_token_encrypted?: string;
  is_active: boolean;
  plan?: string;
  created_at: string;
  updated_at: string;
}

export type CreateTenantInput = Omit<Tenant, "id" | "created_at" | "updated_at">;
export type UpdateTenantInput = Partial<CreateTenantInput>;
