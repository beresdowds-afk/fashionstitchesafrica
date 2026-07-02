import { supabase } from "@/integrations/supabase/client";

/**
 * Unified catalogue cart flow.
 *
 * Used by both the native org website (/site/:slug) and the demo site so
 * organizations get identical item availability, pricing, and checkout
 * behavior everywhere — including iframes embedded on non-native domains
 * (the embed widget loads /site/:slug, which uses this same module).
 *
 * Cart state is stored client-side per orgId in localStorage. Server-side
 * re-pricing happens in the `submit-cart-order` edge function — clients
 * cannot tamper with prices.
 */

export interface CartItem {
  id: string;
  name: string;
  unit_price: number;
  currency: string;
  quantity: number;
  image_url?: string | null;
  category?: string | null;
  source: "org_catalogue" | "tailor_catalogue";
  selected_size?: string | null;
  size_standard?: string | null;
}

const KEY = (orgId: string) => `fsa_cart_${orgId}`;

export const getCart = (orgId: string): CartItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY(orgId));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
};

const writeCart = (orgId: string, items: CartItem[]) => {
  try {
    window.localStorage.setItem(KEY(orgId), JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("fsa-cart-updated", { detail: { orgId } }));
  } catch {
    /* ignore quota errors */
  }
};

export const addToCart = (orgId: string, item: Omit<CartItem, "quantity">, qty = 1) => {
  const cart = getCart(orgId);
  const existing = cart.find(
    (c) =>
      c.id === item.id &&
      c.source === item.source &&
      (c.selected_size ?? null) === (item.selected_size ?? null),
  );
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ ...item, quantity: qty });
  }
  writeCart(orgId, cart);
};

export const updateQty = (orgId: string, itemId: string, qty: number) => {
  const cart = getCart(orgId)
    .map((c) => (c.id === itemId ? { ...c, quantity: Math.max(0, qty) } : c))
    .filter((c) => c.quantity > 0);
  writeCart(orgId, cart);
};

export const removeFromCart = (orgId: string, itemId: string) => {
  writeCart(orgId, getCart(orgId).filter((c) => c.id !== itemId));
};

export const clearCart = (orgId: string) => writeCart(orgId, []);

export const cartTotal = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

export interface SubmitCartArgs {
  orgId: string;
  source: "native" | "embed" | "demo";
  originUrl?: string;
  customer: { name: string; email: string; phone?: string };
  notes?: string;
}

export interface SubmitCartResult {
  ok: boolean;
  order_id?: string;
  order_number?: string;
  total?: number;
  currency?: string;
  error?: string;
}

/**
 * Submit the current cart for an org. The edge function will:
 *  1. Re-price every line server-side against org_catalogue_items
 *  2. Reject items that are unavailable / unpublished
 *  3. Create the order + order_items rows
 *  4. Dispatch notifications to the org
 *  5. Write an audit_logs row (action=catalogue_cart_submitted) so org
 *     admins and super admins can review who submitted what at what price.
 */
export async function submitCartOrder(args: SubmitCartArgs): Promise<SubmitCartResult> {
  const items = getCart(args.orgId);
  if (items.length === 0) return { ok: false, error: "Cart is empty" };

  // Demo mode short-circuits — no server write, just simulate success.
  if (args.source === "demo") {
    clearCart(args.orgId);
    return {
      ok: true,
      order_number: `DEMO-${Date.now().toString().slice(-6)}`,
      total: cartTotal(items),
      currency: items[0]?.currency || "NGN",
    };
  }

  const { data, error } = await supabase.functions.invoke("submit-cart-order", {
    body: {
      org_id: args.orgId,
      source: args.source,
      origin_url: args.originUrl ?? (typeof window !== "undefined" ? window.location.href : ""),
      customer: args.customer,
      notes: args.notes ?? null,
      items: items.map((i) => ({
        id: i.id,
        source: i.source,
        quantity: i.quantity,
        client_unit_price: i.unit_price,
        selected_size: i.selected_size ?? null,
        size_standard: i.size_standard ?? null,
      })),
    },
  });

  if (error) return { ok: false, error: error.message };
  if (data?.ok) {
    clearCart(args.orgId);
    return data as SubmitCartResult;
  }
  return { ok: false, error: data?.error || "Unknown error" };
}