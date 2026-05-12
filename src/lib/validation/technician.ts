import { z } from "zod";

function optStr(maxLen: number) {
  return z
    .string()
    .max(maxLen)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));
}

export const CreateTechnicianSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(120, "Name must be 120 characters or less")
    .transform((v) => v.trim()),

  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .transform((v) => v.toLowerCase().trim()),

  phone: optStr(30),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export type CreateTechnicianInput = z.infer<typeof CreateTechnicianSchema>;
export type CreateTechnicianFieldErrors = Partial<Record<keyof CreateTechnicianInput, string>>;

export const PatchTechnicianSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(120)
    .transform((v) => v.trim())
    .optional(),

  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .transform((v) => v.toLowerCase().trim())
    .optional(),

  phone: optStr(30),

  is_active: z.boolean().optional(),

  new_password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});

export type PatchTechnicianInput = z.infer<typeof PatchTechnicianSchema>;
