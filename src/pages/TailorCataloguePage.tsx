import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { ArrowLeft, Search, ShoppingBag, Sparkles, Tag, Instagram, Facebook, Twitter, Linkedin, Youtube, ExternalLink, Scissors } from "lucide-react";

interface TailorProfile {
  id: string;
  display_name: string | null;
  bio: string | null;
  specialty: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
}

const TikTokIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const TailorCataloguePage = () => {
  const { tailorId } = useParams<{ tailorId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tailorId) return;
    const load = async () => {
      const [profileRes, itemsRes] = await Promise.all([
        supabase.from("profiles").select("id, display_name, bio, specialty, instagram_url, facebook_url, twitter_url, tiktok_url, youtube_url, linkedin_url, portfolio_url").eq("id", tailorId).single(),
        supabase.from("tailor_catalogue_items").select("*").eq("tailor_id", tailorId).eq("is_published", true).order("created_at", { ascending: false }),
      ]);
      setProfile(profileRes.data as TailorProfile | null);
      setItems(itemsRes.data || []);
      setLoading(false);
    };
    load();
  }, [tailorId]);

  const categories = ["all", ...new Set(items.map(i => i.category || "general"))];
  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === "all" || (i.category || "general") === selectedCategory;
    return matchSearch && matchCat;
  });

  const socialLinks = profile ? [
    { url: profile.instagram_url, icon: Instagram, label: "Instagram" },
    { url: profile.facebook_url, icon: Facebook, label: "Facebook" },
    { url: profile.twitter_url, icon: Twitter, label: "X" },
    { url: profile.tiktok_url, icon: TikTokIcon, label: "TikTok" },
    { url: profile.youtube_url, icon: Youtube, label: "YouTube" },
    { url: profile.linkedin_url, icon: Linkedin, label: "LinkedIn" },
  ].filter(s => s.url) : [];

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

      {/* Hero header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 lg:px-8 py-6 max-w-5xl">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft size={16} className="mr-1" /> Back
          </Button>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Scissors size={28} className="text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="font-heading font-bold text-xl">{profile?.display_name || "Tailor"}</h1>
              {profile?.specialty && (
                <Badge variant="secondary" className="mt-1 text-xs">{profile.specialty}</Badge>
              )}
              {profile?.bio && (
                <p className="text-sm text-muted-foreground mt-2 max-w-lg">{profile.bio}</p>
              )}
              {socialLinks.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {socialLinks.map(s => (
                    <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors">
                      <s.icon size={14} />
                    </a>
                  ))}
                  {profile?.portfolio_url && (
                    <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              )}
            </div>
            <Badge className="bg-primary/10 text-primary">{filtered.length} items</Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-8 py-6 max-w-5xl">
        {/* Search & filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
            <p className="text-muted-foreground">No items available yet.</p>
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
                  {item.source && item.source !== "manual" && (
                    <Badge className="absolute top-2 left-2 bg-card/90 text-foreground text-[10px] gap-1">
                      {item.social_platform || item.source}
                    </Badge>
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
                      {item.currency || "NGN"} {Number(item.price).toLocaleString()}
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

export default TailorCataloguePage;
