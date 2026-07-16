import { z } from "zod";

// ─── Public (customer-facing, unauthenticated) ────────────────────────────────

export const RequestLinkSchema = z.object({
  email: z.string().email("Enter a valid email").max(200).transform((v) => v.trim().toLowerCase()),
});
export type RequestLinkInput = z.infer<typeof RequestLinkSchema>;

// ─── Portal customer self-service (authenticated by session) ──────────────────

export const UpdatePortalProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).transform((v) => v.trim()).optional(),
  phone: z.string().max(30).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});
export type UpdatePortalProfileInput = z.infer<typeof UpdatePortalProfileSchema>;

export const PortalDecisionSchema = z.object({
  version: z.number().int().min(1),
  /** Typed-name signature for accept. */
  accepted_by_name: z.string().min(1, "Please type your name").max(200).transform((v) => v.trim()).optional(),
  reason: z.string().max(2000).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});
export type PortalDecisionInput = z.infer<typeof PortalDecisionSchema>;

export const PortalPaySchema = z.object({
  payment_type: z.enum(["deposit", "balance"]).default("balance"),
});
export type PortalPayInput = z.infer<typeof PortalPaySchema>;

// ─── Admin portal-user management (staff-authenticated) ───────────────────────

export const InvitePortalCustomerSchema = z.object({
  email: z.string().email("Enter a valid email").max(200).transform((v) => v.trim().toLowerCase()),
  name: z.string().min(1, "Name is required").max(200).transform((v) => v.trim()),
  phone: z.string().max(30).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  /** Properties to grant access to (at least one). */
  property_ids: z.array(z.string().uuid()).min(1, "Link at least one property").max(100),
});
export type InvitePortalCustomerInput = z.infer<typeof InvitePortalCustomerSchema>;

export const UpdatePortalCustomerSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  phone: z.string().max(30).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  is_active: z.boolean().optional(),
  property_ids: z.array(z.string().uuid()).max(100).optional(),
});
export type UpdatePortalCustomerInput = z.infer<typeof UpdatePortalCustomerSchema>;
