import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Globe,
  Smartphone,
  ShoppingCart,
  Bell,
  Scissors,
  Building2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

const Section = ({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <Icon size={16} className="text-primary" />
      <h3 className="font-heading font-semibold text-sm">{title}</h3>
    </div>
    <div className="text-sm text-muted-foreground space-y-2 pl-6">{children}</div>
  </div>
);

interface Props {
  role?: "organization" | "designer" | "tailor" | "customer" | null;
  compact?: boolean;
}

/**
 * Concise, role-aware user guide for catalogue and cart workflows.
 * Surfaced inside the org dashboard (Orders), the tailor catalogue manager,
 * and the standalone /help/catalogue route.
 */
const CatalogueCartGuide = ({ role = "organization", compact = false }: Props) => {
  return (
    <Card className={compact ? "p-4 space-y-4" : "p-6 space-y-6"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-primary" />
          <h2 className="font-heading font-bold text-lg">Catalogue & Cart Guide</h2>
        </div>
        <Badge variant="secondary" className="capitalize">{role ?? "all roles"}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Your catalogue powers your native FYSORA FASHN site (<code>/site/your-slug</code>), the demo
        preview, and the embed widget on non-native domains — all three flows share the same item
        availability, pricing, and checkout, with prices re-verified on the server before any order
        is created.
      </p>

      {(role === "organization" || !role) && (
        <>
          <Section icon={Building2} title="Organizations — manage your catalogue">
            <p>
              <strong>From the dashboard:</strong> add, edit, archive, and price items. Toggle
              availability to control what visitors can add to cart.
            </p>
            <p>
              <strong>From the mobile app:</strong> quick edits to price, stock, photos and the
              publish toggle. Full editing remains on the dashboard.
            </p>
            <p>
              <strong>Pricing parity:</strong> the price set on the dashboard is the price charged
              everywhere — native site, demo preview, and external embeds. Server-side re-pricing
              rejects any client tampering and logs the attempt for review.
            </p>
          </Section>

          <Section icon={ShoppingCart} title="How carts and orders work">
            <p>
              Visitors add items to a floating cart on your site. Submitting the cart creates a
              pending order in <strong>Orders</strong>, attaches an order item per line, and
              notifies your org admins and managers in real time.
            </p>
            <p>
              Guests are asked to sign in before submitting so the order links to a real customer
              record. Embedded carts on external domains follow the exact same flow.
            </p>
          </Section>

          <Section icon={Bell} title="Notifications">
            <p>
              Each cart submission triggers in-app notifications for all org admins and managers.
              Email, SMS, and WhatsApp fan-out follows your <em>Communications &gt; Notification
              Settings</em> rules — African numbers route via Termii, international via Twilio.
            </p>
          </Section>
        </>
      )}

      {(role === "designer" || !role) && (
        <Section icon={Sparkles} title="Designers">
          <p>
            Designers manage their catalogue inside their personal designer studio (a private
            org). Items publish under that studio and follow the same cart and notification rules
            as any other organization.
          </p>
        </Section>
      )}

      {(role === "tailor" || !role) && (
        <Section icon={Scissors} title="Tailors (contract-bound)">
          <p>
            Tailors do not sell directly to customers. Catalogue items live inside the contracted
            organization’s scope — when a customer adds one to cart, the order is created under
            the organization that holds the contract, and the tailor receives an assignment
            notification.
          </p>
        </Section>
      )}

      <Section icon={Globe} title="Native vs external domains">
        <p>
          The embed widget served from <code>/functions/v1/embed-widget</code> renders your
          catalogue inside an iframe on external domains. Because it iframes the same native page,
          stock, prices, and the cart UI are byte-for-byte identical to <code>/site/:slug</code>.
        </p>
      </Section>

      <Section icon={Smartphone} title="Mobile + PWA">
        <p>
          The branded organization PWA exposes the same catalogue and cart, with offline
          fall-backs via service workers. Cart contents persist per-org in local storage and sync
          on next submission.
        </p>
      </Section>

      <Section icon={ShieldCheck} title="Audit trail">
        <p>
          Every cart submission writes an <code>audit_logs</code> entry tagged{" "}
          <code>catalogue_cart_submitted</code> with the role, source (native / embed / demo),
          line items, server-verified prices, and origin URL. Org admins can review submissions
          inside <em>Orders &gt; Cart Submissions</em>; super admins can review platform-wide
          inside <em>Super Admin &gt; Audit Logs</em>.
        </p>
      </Section>
    </Card>
  );
};

export default CatalogueCartGuide;