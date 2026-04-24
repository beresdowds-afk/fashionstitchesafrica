import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import IdentityVerificationGate from "@/components/shared/IdentityVerificationGate";
import FreeTourConsentDialog from "@/components/shared/FreeTourConsentDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { ArrowLeft, Search, ShoppingBag, Tag, Building2, LogIn, Eye, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_FREE_TOURS = 2;

interface CatalogueItem {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  price: number | null;
  currency: string | null;
  tags: string[] | null;
  is_available: boolean;
  org_name?: string;
}

const PlatformCataloguePage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  // Free tour state
  const [toursUsed, setToursUsed] = useState(0);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [tourActive, setTourActive] = useState(false); // true when user accepted consent for this session

  // Determine user role + profile info
  useEffect(() => {
    if (!user) { setRoleLoading(false); setProfileLoading(false); return; }
    const fetchAll = async () => {
      const [roleRes, profileRes, subRes] = await Promise.all([
        supabase.from("user_roles" as any).select("role").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("free_tours_used, identity_verified").eq("id", user.id).single(),
        supabase.from("customer_subscriptions" as any).select("id").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      ]);
      setUserRole((roleRes.data as any)?.role || "customer");
      setToursUsed((profileRes.data as any)?.free_tours_used || 0);
      setIsVerified(!!(profileRes.data as any)?.identity_verified);
      setHasSubscription(!!subRes.data);
      setRoleLoading(false);
      setProfileLoading(false);
    };
    fetchAll();
  }, [user]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("org_catalogue_items")
        .select("*, organizations(name)")
        .eq("is_available", true)
        .order("name");

      setItems(
        (data || []).map((item: any) => ({
          ...item,
          org_name: item.organizations?.name || "Unknown",
        }))
      );
      setLoading(false);
    };
    load();
  }, []);

  const categories = ["all", ...new Set(items.map(i => i.category || "general"))];
  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.org_name || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === "all" || (i.category || "general") === selectedCategory;
    return matchSearch && matchCat;
  });

  // Catalogue load doesn't depend on auth — render shell ASAP.
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const promptAuth = () => {
    toast({
      title: "Sign in to interact",
      description: "Create a free account or sign in to view product details and place orders.",
    });
    navigate("/auth");
  };

  // Unauthenticated visitors get a free, non-interactive preview of the catalogue.
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-brand" />
        <header className="border-b border-border bg-card sticky top-0 z-30">
          <div className="container mx-auto px-4 lg:px-8 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft size={16} />
              </Button>
              <div>
                <span className="font-heading font-bold text-sm">Platform Catalogue</span>
                <p className="text-[10px] text-muted-foreground">{filtered.length} curated products</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                <Eye size={10} className="mr-1" /> Free Preview
              </Badge>
              <Button variant="hero" size="sm" onClick={() => navigate("/auth")}>
                <LogIn size={14} className="mr-1" /> Sign In
              </Button>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 lg:px-8 py-4 max-w-6xl">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-4 flex items-start gap-2">
            <Lock size={14} className="text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              You're browsing the curated featured catalogue as a guest. <button onClick={() => navigate("/auth")} className="text-primary hover:underline font-medium">Sign in or create a free account</button> to view details, contact fashion houses, and place orders.
            </p>
          </div>

          {/* Search (read-only filtering allowed) */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search products or fashion houses..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <ShoppingBag size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No products available yet.</p>
            </div>
          ) : (
            <div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
              onClickCapture={(e) => {
                // Any click on a product card triggers auth prompt
                e.preventDefault();
                e.stopPropagation();
                promptAuth();
              }}
            >
              {filtered.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); promptAuth(); } }}
                  className="rounded-xl bg-card border border-border overflow-hidden group cursor-pointer hover:border-primary/30 hover:shadow-gold transition-all duration-300 select-none"
                >
                  <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} loading="lazy" draggable={false} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag size={32} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                      <Badge variant="secondary" className="text-[10px]">
                        <Lock size={10} className="mr-1" /> Sign in to view
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="font-heading font-semibold text-sm truncate">{item.name}</h4>
                    <p className="text-[10px] text-muted-foreground truncate">{item.org_name}</p>
                    {item.price != null && (
                      <p className="text-primary font-bold text-sm mt-1">
                        {item.currency || "USD"} {Number(item.price).toLocaleString()}
                      </p>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {item.tags.slice(0, 2).map((t: string) => (
                          <span key={t} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Tag size={8} /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="mt-8 rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Ready to shop? Create your free account to start placing orders.
            </p>
            <Button size="sm" onClick={() => navigate("/auth")}>
              <LogIn size={14} className="mr-1" /> Sign In / Sign Up
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated flow below — wait for role/profile to resolve
  if (roleLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isPrivilegedRole = ["super_admin", "super_assistant", "org_admin", "manager", "tailor", "designer"].includes(userRole || "");
  const isCustomer = !isPrivilegedRole;
  const hasFullAccess = isPrivilegedRole || (hasSubscription && isVerified);

  // For customers: determine if they're on a free tour or need gating
  const isOnFreeTour = isCustomer && !hasFullAccess && tourActive;

  const catalogueContent = (readOnly: boolean) => (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-brand" />

      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="container mx-auto px-4 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <div>
              <span className="font-heading font-bold text-sm">Platform Catalogue</span>
              <p className="text-[10px] text-muted-foreground">{filtered.length} products</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {readOnly && (
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                <Eye size={10} className="mr-1" /> Read-Only Tour
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/browse")}>
              <Building2 size={14} className="mr-1" /> Browse Fashion Houses
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-8 py-6 max-w-6xl">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products or fashion houses..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No products available yet.</p>
          </div>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 ${readOnly ? "pointer-events-none select-none" : ""}`}>
            {filtered.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`rounded-xl bg-card border border-border overflow-hidden group transition-all duration-300 ${
                  readOnly ? "opacity-90" : "hover:border-primary/30 hover:shadow-gold"
                }`}
              >
                <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag size={32} className="text-muted-foreground" />
                    </div>
                  )}
                  {readOnly && (
                    <div className="absolute inset-0 bg-background/10 flex items-end justify-center pb-2">
                      <Badge variant="secondary" className="text-[9px] opacity-80">
                        <Eye size={8} className="mr-1" /> Preview Only
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h4 className="font-heading font-semibold text-sm truncate">{item.name}</h4>
                  <p className="text-[10px] text-muted-foreground truncate">{item.org_name}</p>
                  {item.price != null && (
                    <p className="text-primary font-bold text-sm mt-1">
                      {item.currency || "USD"} {Number(item.price).toLocaleString()}
                    </p>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {item.tags.slice(0, 2).map((t: string) => (
                        <span key={t} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Tag size={8} /> {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {readOnly && (
          <div className="mt-8 rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Enjoying the catalogue? Subscribe for <span className="font-semibold text-primary">$10/year</span> to unlock full access.
            </p>
            <Button size="sm" onClick={() => navigate("/portal")}>
              Subscribe & Verify Identity
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Privileged roles: full unrestricted access
  if (isPrivilegedRole) return catalogueContent(false);

  // Customers with subscription + verification: full access
  if (hasFullAccess) return catalogueContent(false);

  // Customers on an active free tour session: read-only view
  if (isOnFreeTour) return catalogueContent(true);

  // Customers who haven't started a tour or need consent: show consent/exhausted dialog
  return (
    <FreeTourConsentDialog
      toursUsed={toursUsed}
      maxTours={MAX_FREE_TOURS}
      onConsentGiven={() => {
        setToursUsed(prev => prev + 1);
        setTourActive(true);
      }}
      onSubscribe={() => navigate("/portal")}
    />
  );
};

export default PlatformCataloguePage;
