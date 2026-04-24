import { supabase } from "@/integrations/supabase/client";

export type JoinRole = "customer" | "designer" | "tailor" | "manager";

export interface JoinOrgResult {
  ok: boolean;
  /** When true, the caller should redirect to `checkoutUrl` to complete payment. */
  paymentRequired?: boolean;
  checkoutUrl?: string;
  reference?: string;
  membershipId?: string;
  reactivated?: boolean;
  error?: string;
}

/**
 * Canonical "join an organization" helper.
 *
 * 1. Calls the `join_organization` SECURITY DEFINER RPC, which inserts (or
 *    reactivates) an `org_members` row for the current user.
 * 2. For `customer` joins, checks whether a paid `customer_registrations` row
 *    exists. If not, kicks off `initialize-registration-payment` so the caller
 *    can redirect the user to the gateway checkout.
 * 3. Fires the admin notification.
 *
 * Use this everywhere a user joins an org — never insert directly into
 * `org_members` from the client.
 */
export async function joinOrganization(
  orgId: string,
  role: JoinRole = "customer",
  opts: { skipPayment?: boolean; callbackUrl?: string } = {}
): Promise<JoinOrgResult> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { ok: false, error: "Not authenticated" };

  // 1. RPC: insert/reactivate membership
  const { data: rpcData, error: rpcError } = await supabase.rpc("join_organization", {
    _org_id: orgId,
    _role: role,
  });

  if (rpcError) return { ok: false, error: rpcError.message };

  const membership = (rpcData ?? {}) as {
    membership_id?: string;
    created?: boolean;
    reactivated?: boolean;
  };

  // Fire admin notification (best-effort)
  supabase.functions.invoke("notify-admin-registration", {
    body: { org_id: orgId, user_id: user.id, user_email: user.email },
  }).catch(console.error);

  // 2. For customers, check whether a registration fee is owed
  if (role === "customer" && !opts.skipPayment) {
    const { data: existingReg } = await supabase
      .from("customer_registrations")
      .select("status")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!existingReg || (existingReg.status !== "paid" && existingReg.status !== "waived")) {
      const callbackUrl =
        opts.callbackUrl ||
        `${window.location.origin}/portal?reg_status=success&org=${orgId}`;

      const { data: payData, error: payError } = await supabase.functions.invoke(
        "initialize-registration-payment",
        { body: { org_id: orgId, callback_url: callbackUrl } }
      );

      if (payError || !payData?.checkout_url) {
        // Membership was created, but payment couldn't start — surface the error.
        return {
          ok: true,
          membershipId: membership.membership_id,
          paymentRequired: true,
          error: payError?.message || payData?.error || "Failed to start registration payment",
        };
      }

      return {
        ok: true,
        membershipId: membership.membership_id,
        reactivated: membership.reactivated,
        paymentRequired: true,
        checkoutUrl: payData.checkout_url,
        reference: payData.reference,
      };
    }
  }

  return {
    ok: true,
    membershipId: membership.membership_id,
    reactivated: membership.reactivated,
  };
}