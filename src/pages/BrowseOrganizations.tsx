import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Search, Building2, MapPin, Globe, ArrowLeft, Phone, Palette,
  Star, ChevronRight, Loader2, ShoppingBag
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrgCard {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  currency: string | null;
  phone: string | null;
  invite_code: string | null;
  logo_url: string | null;
  created_at: string;
  catalogue_count?: number;
}

const BrowseOrganizations = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrgCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [myOrgIds, setMyOrgIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchOrgs = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, name, slug, country, currency, phone, invite_code, logo_url, created_at")
        .eq("is_active", true)
        .order("name");
      
      // Fetch catalogue counts per org
      const orgIds = (data || []).map(o => o.id);
      let catalogueCounts: Record<string, number> = {};
      if (orgIds.length > 0) {
        const { data: cats } = await supabase
          .from("garment_catalog")
          .select("org_id")
          .eq("is_published", true)
          .in("org_id", orgIds);
        (cats || []).forEach(c => {
          catalogueCounts[c.org_id] = (catalogueCounts[c.org_id] || 0) + 1;
        });
      }

      setOrgs((data || []).map(o => ({ ...o, catalogue_count: catalogueCounts[o.id] || 0 })));
      setLoading(false);
    };

    const fetchMyMemberships = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .eq("is_active", true);
      setMyOrgIds(new Set((data || []).map(m => m.org_id)));
    };

    fetchOrgs();
    fetchMyMemberships();
  }, [user]);

  const handleJoin = async (org: OrgCard) => {
    if (!user) {
      navigate("/auth?portal=1");
      return;
    }
    setJoiningId(org.id);
    const { error } = await supabase.from("org_members").insert({
      org_id: org.id,
      user_id: user.id,
      role: "customer",
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Joined!", description: `You've been added to ${org.name}.` });
      setMyOrgIds(prev => new Set([...prev, org.id]));
      supabase.functions.invoke("notify-admin-registration", {
        body: { org_id: org.id, user_id: user.id, user_email: user.email, org_name: org.name },
      }).catch(console.error);
    }
    setJoiningId(null);
  };

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.country || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-brand" />

      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="container mx-auto px-4 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center">
              <span className="font-heading font-bold text-primary-foreground text-sm">FS</span>
            </div>
            <span className="font-heading font-bold text-sm">Browse Fashion Houses</span>
          </div>
          {!user && (
            <Button variant="hero" size="sm" onClick={() => navigate("/auth")}>Sign In</Button>
          )}
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-8 py-6 max-w-4xl">
        {/* Search */}
        <div className="relative mb-6">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search fashion houses by name or country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Building2 size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No fashion houses found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((org, i) => (
              <motion.div
                key={org.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl bg-card border border-border p-5 hover:border-primary/30 hover:shadow-gold transition-all duration-300 group"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-brand flex items-center justify-center shrink-0">
                    {org.logo_url ? (
                      <img src={org.logo_url} alt={org.name} className="w-14 h-14 rounded-xl object-cover" />
                    ) : (
                      <span className="font-heading font-bold text-primary-foreground text-lg">
                        {org.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-semibold text-base truncate">{org.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      {org.country && (
                        <span className="flex items-center gap-1">
                          <MapPin size={10} /> {org.country}
                        </span>
                      )}
                      {org.currency && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{org.currency}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                  {(org.catalogue_count || 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Palette size={10} className="text-primary" /> {org.catalogue_count} items
                    </span>
                  )}
                  <button
                    onClick={() => navigate(`/site/${org.slug}`)}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Globe size={10} /> Visit Site
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {myOrgIds.has(org.id) ? (
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate("/portal")}>
                      <ShoppingBag size={14} className="mr-1" /> Go to Portal
                    </Button>
                  ) : (
                    <Button
                      variant="hero"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleJoin(org)}
                      disabled={joiningId === org.id}
                    >
                      {joiningId === org.id ? (
                        <><Loader2 size={14} className="mr-1 animate-spin" /> Joining...</>
                      ) : (
                        "Join as Customer"
                      )}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => navigate(`/catalogue/${org.id}`)}>
                    <Palette size={14} />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowseOrganizations;
