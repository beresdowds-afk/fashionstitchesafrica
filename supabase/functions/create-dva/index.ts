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
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { account_type = "dedicated", purpose = "general", amount, preferred_bank } = body;

    // Step 1: Create or get Paystack customer
    let customerCode: string;
    const { data: existingVA } = await supabase
      .from("paystack_virtual_accounts")
      .select("customer_code")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existingVA?.customer_code) {
      customerCode = existingVA.customer_code;
    } else {
      // Create customer on Paystack
      const customerRes = await fetch("https://api.paystack.co/customer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          first_name: user.user_metadata?.display_name?.split(" ")[0] || "",
          last_name: user.user_metadata?.display_name?.split(" ").slice(1).join(" ") || "",
          phone: user.phone || undefined,
        }),
      });

      const customerData = await customerRes.json();
      if (!customerData.status) {
        return new Response(JSON.stringify({ error: "Failed to create Paystack customer", details: customerData.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      customerCode = customerData.data.customer_code;
    }

    // Step 2: For dedicated accounts, check if one already exists
    if (account_type === "dedicated") {
      const { data: existingDedicated } = await supabase
        .from("paystack_virtual_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("account_type", "dedicated")
        .eq("is_active", true)
        .maybeSingle();

      if (existingDedicated) {
        return new Response(JSON.stringify({
          message: "Dedicated account already exists",
          virtual_account: existingDedicated,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Step 3: Create DVA on Paystack
    const dvaPayload: any = {
      customer: customerCode,
      preferred_bank: preferred_bank || "wema-bank",
    };

    // For temporary accounts, set a subaccount or specific amount
    if (account_type === "temporary" && amount) {
      dvaPayload.amount = Math.round(amount * 100); // Paystack uses kobo
    }

    const dvaRes = await fetch("https://api.paystack.co/dedicated_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dvaPayload),
    });

    const dvaData = await dvaRes.json();
    if (!dvaData.status) {
      return new Response(JSON.stringify({ error: "Failed to create virtual account", details: dvaData.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dva = dvaData.data;

    // Step 4: Store in database
    const { data: savedVA, error: saveError } = await supabase
      .from("paystack_virtual_accounts")
      .insert({
        user_id: user.id,
        account_type,
        customer_code: customerCode,
        dva_id: String(dva.id),
        bank_name: dva.bank?.name || dva.assignment?.bank_name || "Wema Bank",
        bank_slug: dva.bank?.slug || preferred_bank || "wema-bank",
        account_number: dva.account_number,
        account_name: dva.account_name,
        currency: "NGN",
        is_active: true,
        purpose,
        expected_amount: amount || null,
        expires_at: account_type === "temporary"
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : null,
      })
      .select()
      .single();

    if (saveError) {
      return new Response(JSON.stringify({ error: "Failed to save virtual account", details: saveError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      message: "Virtual account created successfully",
      virtual_account: savedVA,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
