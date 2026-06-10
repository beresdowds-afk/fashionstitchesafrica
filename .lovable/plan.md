# Unify Catalogue & Cart Flows + Audit Logs + In-App Guide

## 1. Unified Catalogue & Cart

**Goal:** Identical item availability, pricing, and checkout behavior on the native org site (`/site/:slug`), the demo site, and the embed widget on external/non-native domains.

- Create `src/lib/catalogueResolver.ts` — single source of truth that returns published items for an org from `org_catalogue_items` (+ contracted tailors' `tailor_catalogue_items` where `org_id` matches and `is_published=true`), normalizes price/currency via the org's configured currency, and applies the same availability rules (stock flag, archived, exemption-aware pricing).
- Create `src/lib/cartFlow.ts` — shared cart→order submission helper used by:
  - `src/pages/OrgWebsite.tsx` (native)
  - `src/pages/DemoOrgWebsite.tsx`
  - `supabase/functions/embed-widget/index.ts` (external embed → posts to a new shared endpoint)
- New edge function `supabase/functions/submit-cart-order/index.ts`:
  - Accepts `{ org_id, items[], customer{name,email,phone}, source: 'native'|'embed'|'demo', origin_url }`.
  - Re-prices server-side using the resolver (rejects client price tampering), creates the `orders` + `order_items` rows, dispatches notification to org via `notificationDispatcher`, and writes an audit log entry.
- Update `embed-widget/index.ts` to call `submit-cart-order` instead of its inline cart pipe, so the external flow shares the exact same pricing + notification path as native.

## 2. Catalogue Cart Audit Logs

- Extend usage of existing `audit_logs` table (no schema change) with two new action keys:
  - `catalogue_cart_submitted` — written by `submit-cart-order` with metadata `{ source, org_id, role, items: [{id, name, unit_price, qty}], total, currency, customer_email, origin_url, user_agent }`.
  - `catalogue_item_priced` — written when resolver detects a client/server price mismatch (security signal).
- Add a "Cart Submissions" filter chip + entity type `cart_submission` to `src/components/super-admin/AuditLogsPanel.tsx` so super admins can review who submitted what items at which prices, scoped by org.
- Add an org-scoped read-only view in the org dashboard: new component `src/components/orders/CartSubmissionLog.tsx` rendered as a tab inside `OrdersTab.tsx`, fetching audit_logs filtered by `entity_type='cart_submission'` and `org_id`.

## 3. In-App User Guide

- New component `src/components/help/CatalogueCartGuide.tsx` — concise, role-aware guide covering:
  - Organizations: dashboard vs mobile editing, pricing rules, publish toggle, native site vs external embed parity, where cart submissions land, how notifications fan out (in-app, email, SMS/WhatsApp via routing rules).
  - Designers: catalogue scope inside their personal org, publish flow.
  - Tailors: contract-bound catalogue, org-scoped publishing.
- Mount the guide:
  - As a "Guide" tab inside `TailorCatalogueManager.tsx` (visible to tailors/designers).
  - As an accordion section at the top of `OrdersTab.tsx` (collapsible, dismissible per user via `localStorage`).
  - As a route `/help/catalogue` linked from the org dashboard sidebar under Help.

## Technical Notes

- No schema migrations required — reuses `audit_logs`, `org_catalogue_items`, `tailor_catalogue_items`, `orders`, `order_items`.
- Edge function uses service role for inserts but only after re-pricing and validating org/customer fields with Zod.
- Embed widget keeps its current iframe contract; only the submit endpoint changes.
- All currency formatting goes through existing `CurrencyDisplay` / org currency helpers — no new pricing logic.

## File Summary

**New:** `src/lib/catalogueResolver.ts`, `src/lib/cartFlow.ts`, `src/components/orders/CartSubmissionLog.tsx`, `src/components/help/CatalogueCartGuide.tsx`, `src/pages/HelpCatalogue.tsx`, `supabase/functions/submit-cart-order/index.ts`

**Edited:** `src/pages/OrgWebsite.tsx`, `src/pages/DemoOrgWebsite.tsx`, `supabase/functions/embed-widget/index.ts`, `src/components/orders/OrdersTab.tsx`, `src/components/super-admin/AuditLogsPanel.tsx`, `src/components/catalogue/TailorCatalogueManager.tsx`, `src/App.tsx` (route), `src/components/dashboard/OrgDashboardSidebar.tsx` (link)
