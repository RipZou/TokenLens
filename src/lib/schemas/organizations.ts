import { z } from "zod";
import { ROLES } from "@/lib/auth/permissions";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(ROLES),
});

export const changeRoleSchema = z.object({
  role: z.enum(ROLES),
});
