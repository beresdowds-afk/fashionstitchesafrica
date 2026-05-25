import { supabase } from "@/integrations/supabase/client";

/** Map a user's primary role to the appropriate landing route. */
export function homeForRole(role: string | null | undefined): string {
  switch (role) {
    case "super_admin":
    case "super_assistant":
    case "platform_management":
      return "/super-admin";
    case "customer":
      return "/portal";
    case "designer":
      return "/designer-portal";
    case "tailor":
      return "/tailor-dashboard";
    case "org_admin":
      return "/dashboard";
    case "manager":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

/** Resolve a user's preferred landing route by inspecting their roles + memberships. */
export async function resolveHomeRoute(userId: string): Promise<string> {
  try {
    const [rolesRes, membershipsRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("org_members").select("role").eq("user_id", userId).eq("is_active", true),
    ]);
    const roles = ((rolesRes.data as any[]) || []).map((r) => r.role as string);
    if (roles.some((r) => r === "super_admin" || r === "super_assistant" || r === "platform_management")) {
      return "/super-admin";
    }
    const memberships = ((membershipsRes.data as any[]) || []).map((m) => m.role as string);
    if (memberships.some((r) => r === "org_admin" || r === "manager")) return "/dashboard";
    if (memberships.some((r) => r === "designer")) return "/designer-portal";
    if (memberships.some((r) => r === "tailor")) return "/tailor-dashboard";
    const priv = new Set(["super_admin", "super_assistant", "platform_management"]);
    const primary = roles.find((r) => !priv.has(r)) ?? roles[0] ?? null;
    return homeForRole(primary);
  } catch {
    return "/dashboard";
  }
}