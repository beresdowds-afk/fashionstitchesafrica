import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { ArrowLeft, Search, ShoppingBag, Sparkles, Tag, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const CataloguePage = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [org, setOrg] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    const load = async () => {
      const [orgRes, itemsRes] = await Promise.all([
        supabase.from("organizations").select("id, name, slug, currency, phone").eq("id", orgId).single(),
        supabase.from("garment_catalog").select("*").eq("org_id", orgId).eq("is_published", true).order("name"),
      ]);
      setOrg(orgRes.data);
      setItems(itemsRes.data || []);
      setLoading(false);
    };
    load();
  }, [orgId]);

  const categories = ["all", ...new Set(items.map(i => i.category || "general"))];
  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === "all" || (i.category || "general") === selectedCategory;
    return matchSearch && matchCat;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-brand" />

      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="container mx-auto px-4 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <div>
              <span className="font-heading font-bold text-sm">{org?.name || "Catalogue"}</span>
              <p className="text-[10px] text-muted-foreground">{filtered.length} products</p>
            </div>
          </div>
          {org?.phone && (
            <a href={`tel:${org.phone}`} className="text-muted-foreground hover:text-primary transition-colors">
              <Phone size={16} />
            </a>
          )}
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-8 py-6 max-w-5xl">
        {/* Search & filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
            <p className="text-muted-foreground">No products available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-xl bg-card border border-border overflow-hidden group hover:border-primary/30 hover:shadow-gold transition-all duration-300"
              >
                <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag size={32} className="text-muted-foreground" />
                    </div>
                  )}
                  {item.tryon_enabled && (
                    <Badge className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-[10px] gap-1">
                      <Sparkles size={10} /> Try-On
                    </Badge>
                  )}
                </div>
                <div className="p-3">
                  <h4 className="font-heading font-semibold text-sm truncate">{item.name}</h4>
                  {item.price && (
                    <p className="text-primary font-bold text-sm mt-1">
                      {item.currency || org?.currency || "NGN"} {Number(item.price).toLocaleString()}
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
      </div>
    </div>
  );
};

export default CataloguePage;
