# Plan: Claim Communications, Evidence Export, Notifications & Audit Timeline

## 0. About `/api-docs`
The page wasn't removed — it was never mounted at `/api-docs`. It exists as `src/pages/ApiDocs.tsx` and is registered at **`/docs/api`** in `src/App.tsx`. I'll add a redirect from `/api-docs` → `/docs/api` so the old URL works too.

---

## 1. Claim Chat File Attachments (RLS-protected)

**Storage:** Reuse the existing private `insurance-evidence` bucket under prefix `chat/{claim_id}/{message_id}/...`. RLS on `storage.objects` restricts read/write to: the claim owner (customer), the claim's org members, and super_admin/super_assistant — same access matrix as `insurance_claims`.

**Schema (migration):**
- New table `insurance_claim_messages` (claim_id, sender_id, sender_role, body, created_at).
- New table `insurance_claim_message_attachments` (message_id, claim_id, storage_path, mime_type, size_bytes, scan_status, scan_result).
- GRANTs + RLS scoped via existing `insurance_claims` access helpers.
- Add table to `supabase_realtime` publication for live chat.

**Frontend:**
- `ClaimChatPanel.tsx` — used inside `ClaimTrackingPage` and `AdminClaimsReviewPage`. Supports text + up to 5 attachments per message, 10MB/file, 30MB total, same MIME validation as `ReportIssueDialog`.
- Uploads via signed URLs; previews thumbnails for images, file chip for video/pdf.
- Replaces ad-hoc chat list currently in `ClaimTrackingPage`.

---

## 2. Admin Evidence Export

On `AdminClaimsReviewPage` add an **"Export evidence bundle"** button per claim.

**Approach:** New edge function `insurance-claim-export` (super_admin only, JWT verified in code) that:
1. Loads claim + actions + messages + all evidence file paths.
2. Streams a ZIP containing:
   - `claim.json` (full claim record + timeline)
   - `notes.md` (human-readable summary, status history, admin notes)
   - `evidence/` (original uploaded files)
   - `chat/{message_id}/` (chat attachments)
3. Returns the ZIP as a download.

Uses `jszip` via `npm:` specifier. CORS headers per Edge Function rules.

---

## 3. Notifications on Status Change & Evidence Scan

**In-app:** Extend `transition_insurance_claim` and `update_claim_evidence_scan` RPCs to insert into `notifications` for:
- The claimant (customer)
- Active org admins/managers of the claim's org
- (For scan results) also super_admins of platform

**Email:** New app-email templates via `email_domain--scaffold_transactional_email` if not already scaffolded:
- `insurance-claim-status-update`
- `insurance-claim-evidence-scan`

Triggered from a new edge function `insurance-claim-notify` invoked by the RPCs (or called from client mutation after RPC succeeds, gated by service role). Uses existing `dispatchNotifications` infra where possible.

If email infrastructure isn't yet provisioned I'll run `check_email_domain_status` first and surface the setup dialog before scaffolding.

---

## 4. Detailed Audit Log Timeline

**Data source:** `insurance_claim_actions` already records every status transition with `performed_by`, `action_type`, `description`, `metadata`, `created_at`. Extend coverage so the following are also written there:
- Evidence scan updates (from `update_claim_evidence_scan`)
- Chat message sent (lightweight event, no body) — optional toggle
- Admin assignment / notes added

**Component:** New `ClaimAuditTimeline.tsx` rendering a vertical timeline with: actor display name (joined via `profiles`), role badge, action label, human-readable description, timestamp, and diff metadata (e.g. `submitted → reviewing`).

**Placement:**
- `ClaimTrackingPage` — under the progress bar (customer-facing entries only; redacts admin internal notes).
- `AdminClaimsReviewPage` — full timeline including internal metadata.

A new RPC `get_claim_audit_timeline(_claim_id)` (SECURITY DEFINER) returns the joined timeline + actor names, with access check identical to claim RLS.

---

## Files to create
- `src/components/insurance/ClaimChatPanel.tsx`
- `src/components/insurance/ClaimAuditTimeline.tsx`
- `supabase/functions/insurance-claim-export/index.ts`
- `supabase/functions/insurance-claim-notify/index.ts`
- `supabase/functions/_shared/transactional-email-templates/insurance-claim-status-update.tsx`
- `supabase/functions/_shared/transactional-email-templates/insurance-claim-evidence-scan.tsx`
- Migration: `insurance_claim_messages`, attachments table, storage RLS, RPC updates, timeline RPC.

## Files to edit
- `src/pages/ClaimTrackingPage.tsx` (use new chat + audit timeline)
- `src/pages/AdminClaimsReviewPage.tsx` (chat, export button, audit timeline)
- `src/hooks/useInsurance.ts` (add hooks: messages, attachments, timeline, export)
- `src/App.tsx` (add `/api-docs` → `/docs/api` redirect)

---

## Open questions
1. **Email infra:** OK to scaffold app-email templates (and set up the email domain if not configured) for the two new claim emails?
2. **Notification recipients on scan result:** include the **claimant** (e.g. "your evidence passed verification") or admins only?
3. **Export format:** ZIP download is fine — or do you prefer a signed link emailed to the admin instead (better for very large bundles)?
