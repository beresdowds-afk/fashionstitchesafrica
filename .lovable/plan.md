## Goal

Make every footer entry on the landing footer either a real navigation link (when a page already exists) or plain non-clickable text (when the page doesn't exist yet). Also make the email, phone, and address clickable.

## Audit of existing routes

Pages that exist today (from `src/App.tsx`):
- `/docs/api` → API Docs
- `/legal` → Legal Document Generator
- `/install` → install instructions / PWA install page
- `/browse` → Browse Organizations
- `/platform-tour` → Platform Tour
- `/payments` → Payments Portal
- `/` → Platform Catalogue (home)

Nothing currently exists for: Features, Pricing, Website Builder, Integrations, About Us, Careers, Blog, Press, Partners, Help Center, Documentation, Status, Contact Us, Community, Privacy Policy, Terms of Service, Cookie Policy, GDPR, Data Protection.

## Link mapping

**Platform**
- Features → plain text (no page)
- Pricing → plain text
- API Docs → `/docs/api` (Link)
- Website Builder → plain text
- Integrations → plain text

**Company**
- About Us, Careers, Blog, Press, Partners → all plain text

**Support**
- Help Center → plain text
- Documentation → `/docs/api` (closest existing surface)
- Status → plain text
- Contact Us → `mailto:` using `settings.contact_email` (acts as the contact channel)
- Community → plain text

**Legal**
- Privacy Policy → `/legal` (Link, opens generator where Privacy can be created)
- Terms of Service → `/legal`
- Cookie Policy → plain text
- GDPR → plain text
- Data Protection → plain text

## Contact block

In the same footer top-left contact section:
- Email → `<a href="mailto:{settings.contact_email}">`
- Phone → `<a href="tel:{digits-only(settings.contact_phone)}">` (strip spaces/dashes for the `tel:` href, keep display value as-is)
- Address → `<a href="https://www.google.com/maps/search/?api=1&query={encoded address}" target="_blank" rel="noopener noreferrer">`

All three keep the existing icon + style; only the wrapper changes to `<a>` with hover styling consistent with the link list (`hover:text-primary transition-colors`).

## Implementation

Single-file edit: `src/components/landing/Footer.tsx`.

1. Replace the flat string arrays in `footerLinks` with an array of `{ label, to?, href? }` objects per category. Items with no `to`/`href` render as `<span>` (muted, no hover, no cursor).
2. Items with `to` render via React Router `<Link>` (import from `react-router-dom`).
3. Items with `href` (e.g. mailto) render as `<a>`.
4. Wrap the email/phone/address contact rows in the appropriate `<a>` tags.
5. No other UI/visual changes; keep colours, spacing, icons, semantic tokens.

## Out of scope

No new pages, no route changes, no business logic, no analytics events.
