import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";
import FeaturedShowcase, { type ShowcaseVariant, type ShowcaseSpeed, type ShowcaseItem } from "./FeaturedShowcase";

interface Props {
  org: { id: string };
}

const VARIANTS: { value: ShowcaseVariant; label: string; hint: string }[] = [
  { value: "infinite-scroll", label: "Continuous infinite scroll", hint: "Seamless horizontal marquee — best for many products." },
  { value: "popup", label: "Pop-up", hint: "Each item scales in then is replaced — playful and bold." },
  { value: "fade", label: "Fade in / fade out", hint: "Soft crossfade between items — minimal and editorial." },
  { value: "fly", label: "Fly in / fly out", hint: "Items slide in from the side — dynamic and modern." },
];

export default function FeaturedShowcasePanel({ org }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [variant, setVariant] = useState<ShowcaseVariant>("infinite-scroll");
  const [speed, setSpeed] = useState<ShowcaseSpeed>("medium");
  const [items, setItems] = useState<ShowcaseItem[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: site }, { data: cat }] = await Promise.all([
        supabase.from("org_websites").select("*").eq("org_id", org.id).maybeSingle(),
        supabase
          .from("org_catalogue_items")
          .select("id,name,image_url,price,currency")
          .eq("org_id", org.id)
          .order("sort_order", { ascending: true })
          .limit(12),
      ]);
      if (site) {
        setSiteId(site.id);
        setEnabled(Boolean((site as any).featured_showcase_enabled));
        setVariant(((site as any).featured_showcase_variant ?? "infinite-scroll") as ShowcaseVariant);
        setSpeed(((site as any).featured_showcase_speed ?? "medium") as ShowcaseSpeed);
      }
      setItems(((cat ?? []) as any[]).map((c) => ({
        id: c.id, name: c.name, image_url: c.image_url, price: c.price, currency: c.currency,
      })));
      setLoading(false);
    })();
  }, [org.id]);

  const ensureSite = async () => {
    if (siteId) return siteId;
    const { data, error } = await supabase.from("org_websites").insert({ org_id: org.id }).select("id").single();
    if (error) throw error;
    setSiteId(data.id);
    return data.id;
  };

  const save = async () => {
    try {
      setSaving(true);
      const id = await ensureSite();
      const { error } = await supabase.from("org_websites").update({
        featured_showcase_enabled: enabled,
        featured_showcase_variant: variant,
        featured_showcase_speed: speed,
      } as any).eq("id", id);
      if (error) throw error;
      toast({
        title: "Showcase saved",
        description: enabled
          ? `Featured catalogue will use the "${variant}" animation on your live site.`
          : "Featured showcase disabled — your catalogue will render normally.",
      });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const previewItems = useMemo<ShowcaseItem[]>(() => {
    if (items.length > 0) return items.slice(0, 8);
    return Array.from({ length: 6 }).map((_, i) => ({
      id: `demo-${i}`,
      name: `Sample Product ${i + 1}`,
      image_url: null,
      price: 9999,
      currency: "₦",
    }));
  }, [items]);

  if (loading) {
    return (
      <Card><CardContent className="p-5 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Loading featured showcase settings…
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-heading font-semibold text-base flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              Featured Catalogue Showcase
              <Badge variant="outline" className="text-[10px]">Feature upgrade</Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Add an eye-catching animated showcase of your featured products to your website. Works with any published template.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{enabled ? "On" : "Off"}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className={enabled ? "" : "opacity-60 pointer-events-none"}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Animation variant</label>
              <Select value={variant} onValueChange={(v) => setVariant(v as ShowcaseVariant)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VARIANTS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {VARIANTS.find((v) => v.value === variant)?.hint}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Speed</label>
              <Select value={speed} onValueChange={(v) => setSpeed(v as ShowcaseSpeed)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">Slow</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="fast">Fast</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 border border-dashed border-border rounded-lg p-3 bg-muted/30">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Live preview</div>
            <FeaturedShowcase items={previewItems} variant={variant} speed={speed} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
            Save showcase settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}