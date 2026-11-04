import { forbidden } from "@/lib/http";

export const ROLES = ["ADMIN", "DEVELOPER", "VIEWER"] as const;

export type Role = (typeof ROLES)[number];

export type Action =
  | "readOrganization"
  | "createProject"
  | "manageApiKeys"
  | "editModelPrices"
  | "configureBudgets"
  | "manageMembers";

const PERMISSIONS: Record<Action, readonly Role[]> = {
  readOrganization: ["ADMIN", "DEVELOPER", "VIEWER"],
  createProject: ["ADMIN", "DEVELOPER"],
  manageApiKeys: ["ADMIN", "DEVELOPER"],
  editModelPrices: ["ADMIN"],
  configureBudgets: ["ADMIN"],
  manageMembers: ["ADMIN"],
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}

export function authorize(role: Role | null, action: Action): Response | null {
  return role && can(role, action) ? null : forbidden();
}
