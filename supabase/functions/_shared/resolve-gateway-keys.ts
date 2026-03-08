/**
 * Shared helper to resolve payment gateway keys.
 * 1. Try org-level keys from org_api_keys
 * 2. Fall back to platform-level keys from platform_api_keys
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface GatewayKeys {
  secretKey: string;
  publicKey?: string;
}

export async function resolveGatewayKeys(
  serviceClient: SupabaseClient,
  orgId: string,
  gateway: string
): Promise<GatewayKeys | null> {
  // 1. Try org-level keys
  const { data: orgKeys } = await serviceClient
    .from("org_api_keys")
    .select("key_name, key_value")
    .eq("org_id", orgId)
    .eq("provider", gateway)
    .eq("is_active", true);

  const orgMap = Object.fromEntries(
    (orgKeys || []).map((k: any) => [k.key_name, k.key_value])
  );

  const orgSecret =
    orgMap["secret_key"] ||
    orgMap["PAYSTACK_SECRET_KEY"] ||
    orgMap["STRIPE_SECRET_KEY"] ||
    orgMap["FLUTTERWAVE_SECRET_KEY"];

  if (orgSecret) {
    return {
      secretKey: orgSecret,
      publicKey: orgMap["public_key"] || orgMap["publishable_key"],
    };
  }

  // 2. Fall back to platform-level keys
  const { data: platformKeys } = await serviceClient
    .from("platform_api_keys")
    .select("key_name, key_value")
    .eq("provider", gateway)
    .eq("is_active", true);

  const platMap = Object.fromEntries(
    (platformKeys || []).map((k: any) => [k.key_name, k.key_value])
  );

  const platSecret = platMap["secret_key"];
  if (platSecret) {
    return {
      secretKey: platSecret,
      publicKey: platMap["public_key"] || platMap["publishable_key"],
    };
  }

  return null;
}

/**
 * Initialize a payment transaction across gateways.
 * Returns { checkoutUrl, reference } or throws.
 */
export async function initializeGatewayPayment(opts: {
  gateway: string;
  keys: GatewayKeys;
  amount: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  email: string;
  metadata: Record<string, unknown>;
  productName?: string;
}): Promise<{ checkoutUrl: string; reference: string }> {
  const { gateway, keys, amount, currency, reference, callbackUrl, email, metadata, productName } = opts;

  if (gateway === "paystack") {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${keys.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: currency || "NGN",
        email,
        reference,
        callback_url: callbackUrl,
        metadata,
      }),
    });
    const data = await res.json();
    if (!data.status) throw new Error(data.message || "Paystack initialization failed");
    return { checkoutUrl: data.data.authorization_url, reference: data.data.reference };
  }

  if (gateway === "stripe") {
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", callbackUrl + (callbackUrl.includes("?") ? "&" : "?") + "payment=success");
    params.append("cancel_url", callbackUrl + (callbackUrl.includes("?") ? "&" : "?") + "payment=cancelled");
    params.append("line_items[0][price_data][currency]", (currency || "USD").toLowerCase());
    params.append("line_items[0][price_data][product_data][name]", productName || "Payment");
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
    params.append("line_items[0][quantity]", "1");
    if (email) params.append("customer_email", email);
    for (const [k, v] of Object.entries(metadata)) {
      params.append(`metadata[${k}]`, String(v));
    }

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(keys.secretKey + ":")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { checkoutUrl: data.url, reference: data.id };
  }

  if (gateway === "flutterwave") {
    const res = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${keys.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: reference,
        amount,
        currency: currency || "NGN",
        redirect_url: callbackUrl,
        meta: metadata,
        customer: { email },
      }),
    });
    const data = await res.json();
    if (data.status !== "success") throw new Error(data.message || "Flutterwave initialization failed");
    return { checkoutUrl: data.data.link, reference };
  }

  throw new Error(`Unsupported gateway: ${gateway}`);
}
