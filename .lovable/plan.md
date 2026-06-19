## FYSORA Order Protection & Contract Assurance — Implementation Plan

A large, multi-phase feature. I'll deliver it in the priority order you specified, in **4 staged batches** so each batch is reviewable and we don't ship a 50-file mega-change.

---

### Batch 1 — Foundation (DB + Feature Flags + Core Service)

**Database migration** (single migration, all tables under `public.` with GRANTs + RLS):
- `insurance_policies` — links to existing `orders` / `tailor_contracts` / `organizations` / `profiles` (no `customers`/`tailors`/`subcontracts` tables exist; mapped to current schema). `policy_type`, `premium_amount`, `coverage_limit`, `excess_amount`, `status`, `terms jsonb`, `feature_flag_version`.
- `insurance_claims` — `claim_type`, evidence URLs, status, amounts, review fields.
- `insurance_claim_actions` — audit trail per claim.
- `insurance_risk_scores` — per tailor/org, 0–100 + tier + factors jsonb, cached 24h.
- `insurance_reserve_ledger` — reserve pool entries (premium / admin fee / platform fee / payout allocations).
- `insurance_feature_flags` — 6 phase flags, `configuration jsonb`, `updated_by`, `updated_at`. Seeded with 6 rows, all `enabled = false`.
- `insurance_config` (single-row table) — fee min/max %, reserve % (60), admin % (20), platform % (20), claims window days, min order value, max coverage, excess defaults.
- RLS: customers see only their policies/claims; org/tailor sees only theirs (via `is_org_member` / membership); super_admin full access. Feature flags + config: read by authenticated, write by `super_admin` only.
- Storage bucket `insurance-evidence` (private) + policies for claim uploaders & super admins.

**Feature Flags Portal** (Super Admin):
- New page `src/pages/super-admin/InsuranceFeatureFlags.tsx` with 6 phase cards, toggle + per-flag config drawer, last-modified timestamps.
- Route mounted under existing super-admin shell.

**Core service** (shared, browser-safe):
- `src/lib/insurance/premium.ts` — `calculatePremium`, `getCoverageLimit`, `getExcess`, `getTier`.
- `src/lib/insurance/risk.ts` — risk score formula (weights: completion 35 / rating 25 / disputes 20 / experience 10 / timeliness 10) with 24h caching via `insurance_risk_scores`.
- `src/hooks/useInsuranceFlags.ts` + `useInsuranceConfig.ts` — react-query hooks gating UI behind flags.
- Edge function `insurance-quote` — server-side premium calculation (auth required, validates flag).

### Batch 2 — Customer Checkout & Order Dashboard

- `src/components/insurance/OrderProtectionToggle.tsx` (gold #D4AF37 + green #008751 design tokens, NOT hardcoded — added to `index.css` as `--insurance-gold` / `--insurance-green`).
- "How it works" 3-step mini-tutorial, expandable coverage accordion.
- "Protected by FYSORA" badge component + Shield-with-needle SVG icon (`src/assets/fysora-shield.svg`).
- Inject toggle into existing checkout flow (will locate exact file when implementing); persists purchase via `insurance-purchase` edge function.
- Order dashboard: badge + status indicator + "Report Issue" CTA on protected orders.

### Batch 3 — Claims (Customer submit + Admin review + Org/Tailor respond)

- `src/pages/insurance/SubmitClaim.tsx` — 5-file upload (10MB cap each) to `insurance-evidence` bucket, claim type selector, preview/confirm.
- `src/pages/insurance/ClaimTracker.tsx` — timeline, status, in-app chat (reuses existing `message_threads`).
- `src/pages/super-admin/InsuranceClaimsReview.tsx` — queue, evidence viewer, approve/reject/partial, notes, automated notification trigger.
- `src/pages/org/IncomingClaims.tsx` — org/tailor respond with evidence.
- Edge functions: `insurance-claim-submit`, `insurance-claim-decide` (handles reserve allocation + payout entry + notifications).

### Batch 4 — Risk Engine (Phase 3), Contract Assurance (Phase 4), Admin Analytics & Config

- Risk score dashboard tab for org/tailor with tier badge + improvement tips.
- Contract creation: opt-in toggle on `tailor_contracts`, premium display, digital certificate (PDF via existing invoice infra).
- Super Admin analytics page: active/claimed/expired counts, claims volume chart (recharts), payouts by month, risk distribution, top claim reasons.
- Super Admin config page: all knobs (fee range, reserve %, admin %, platform %, claims window, min order, max coverage, risk thresholds + multipliers).
- Phases 5 & 6 (AI Measurement Guarantee, Licensed Insurer Partner): flag scaffolding + placeholder config panes only — full implementation deferred until you confirm scope (insurer partner needs an external provider choice).

---

### Technical notes

- **Schema mapping:** Your spec references `customers`, `tailors`, `subcontracts`, `payment_transactions`, `users`. The actual schema uses `profiles` (customers + tailors live here, distinguished by role in `user_roles`/`org_members`), `tailor_contracts` (not `subcontracts`), `payments` (not `payment_transactions`), and `auth.users`. I'll map FKs accordingly.
- **Color tokens:** `#D4AF37` and `#008751` go into `index.css` as HSL semantic tokens (`--insurance-gold`, `--insurance-green`) per project design rules — never hardcoded in components.
- **Feature gating:** Every customer/org/admin entry point checks `insurance_feature_flags.enabled` via `useInsuranceFlags`; disabled phases render nothing (not even hidden code paths).
- **Currency:** NGN primary, USD secondary (matches existing `exchange_rates`).
- **No new external dependency** — Stripe/Paystack/Flutterwave premium charging reuses existing `payments` pipeline.

---

### What I need from you before starting

1. **Approve Batch 1 to start now?** (DB + flags portal + core service is ~6 files + 1 migration.)
2. **Phase 6 (Licensed Insurer Partner):** which provider? (AXA Mansard, Leadway, Hygeia, custom?) — needed before Batch 4. If undecided, I'll ship the flag + config schema only.
3. **Payout method for approved claims:** wallet credit (existing `credit_wallets`), Paystack transfer, or manual admin trigger?
