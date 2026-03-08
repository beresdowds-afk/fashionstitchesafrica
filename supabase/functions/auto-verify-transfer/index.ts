import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate caller is super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super_admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transfer_id } = await req.json();
    if (!transfer_id) {
      return new Response(JSON.stringify({ error: "transfer_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the transfer
    const { data: transfer, error: fetchError } = await supabase
      .from("bank_transfer_payments")
      .select("*")
      .eq("id", transfer_id)
      .single();

    if (fetchError || !transfer) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (transfer.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Transfer already processed", status: transfer.status }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auto-verification logic:
    // 1. Check transfer_reference is not empty
    // 2. Check amount is positive
    // 3. Check no duplicate reference exists (already verified)
    // 4. Check reference format matches expected patterns

    const issues: string[] = [];

    if (!transfer.transfer_reference || transfer.transfer_reference.trim().length < 5) {
      issues.push("Transfer reference is missing or too short (min 5 chars)");
    }

    if (!transfer.amount || Number(transfer.amount) <= 0) {
      issues.push("Invalid transfer amount");
    }

    // Check for duplicate reference (already verified)
    if (transfer.transfer_reference) {
      const { data: duplicates } = await supabase
        .from("bank_transfer_payments")
        .select("id")
        .eq("transfer_reference", transfer.transfer_reference)
        .eq("status", "verified")
        .neq("id", transfer_id);

      if (duplicates && duplicates.length > 0) {
        issues.push("Duplicate transfer reference found (already verified)");
      }
    }

    // Validate reference format for known banks
    const ref = (transfer.transfer_reference || "").trim();
    const isValidFormat =
      /^[A-Za-z0-9\-_\/]{5,50}$/.test(ref) || // Standard alphanumeric
      /^\d{10,25}$/.test(ref); // Numeric session ID

    if (ref && !isValidFormat) {
      issues.push("Transfer reference format appears invalid");
    }

    if (issues.length > 0) {
      // Auto-reject with reasons
      await supabase
        .from("bank_transfer_payments")
        .update({
          status: "rejected",
          auto_verified: true,
          auto_verified_at: new Date().toISOString(),
          verification_method: "auto",
          rejection_reason: issues.join("; "),
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        })
        .eq("id", transfer_id);

      return new Response(
        JSON.stringify({ message: "Transfer auto-rejected", reasons: issues }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All checks passed — auto-verify
    await supabase
      .from("bank_transfer_payments")
      .update({
        status: "verified",
        auto_verified: true,
        auto_verified_at: new Date().toISOString(),
        verification_method: "auto",
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq("id", transfer_id);

    // If purpose is token_purchase, credit the user's wallet
    if (transfer.purpose === "token_purchase") {
      const amount = Number(transfer.amount);
      // Simple credit calculation: 100 NGN = 1 token
      const creditsToAdd = Math.floor(amount / 100);

      if (creditsToAdd > 0) {
        // Get or create wallet
        let { data: wallet } = await supabase
          .from("credit_wallets")
          .select("*")
          .eq("owner_id", transfer.user_id)
          .eq("owner_type", "user")
          .maybeSingle();

        if (!wallet) {
          const { data: newWallet } = await supabase
            .from("credit_wallets")
            .insert({
              owner_id: transfer.user_id,
              owner_type: "user",
              balance: 0,
              currency: "NGN",
            })
            .select()
            .single();
          wallet = newWallet;
        }

        if (wallet) {
          const newBalance = Number(wallet.balance) + creditsToAdd;
          await supabase
            .from("credit_wallets")
            .update({
              balance: newBalance,
              lifetime_purchased: Number(wallet.lifetime_purchased) + creditsToAdd,
            })
            .eq("id", wallet.id);

          await supabase.from("credit_transactions").insert({
            wallet_id: wallet.id,
            amount: creditsToAdd,
            balance_after: newBalance,
            type: "purchase",
            description: `Bank transfer verified (Ref: ${ref})`,
            feature_type: "token_purchase",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Transfer auto-verified successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
