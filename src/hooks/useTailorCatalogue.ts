import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TailorCatalogueItem {
  id: string;
  tailor_id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  price: number | null;
  currency: string | null;
  tags: string[];
  is_published: boolean;
  source: string;
  source_url: string | null;
  social_platform: string | null;
  social_post_id: string | null;
  tryon_enabled: boolean;
  metadata: any;
  created_at: string;
}

export const useTailorCatalogue = (tailorId: string | undefined) => {
  const [items, setItems] = useState<TailorCatalogueItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!tailorId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tailor_catalogue_items")
      .select("*")
      .eq("tailor_id", tailorId)
      .order("created_at", { ascending: false });
    setItems((data as TailorCatalogueItem[]) || []);
    setLoading(false);
  }, [tailorId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addItem = async (item: Partial<TailorCatalogueItem>) => {
    const { data, error } = await supabase.from("tailor_catalogue_items").insert({
      tailor_id: tailorId!,
      org_id: item.org_id || null,
      name: item.name!,
      description: item.description,
      category: item.category,
      image_url: item.image_url,
      price: item.price,
      currency: item.currency,
      tags: item.tags || [],
      is_published: item.is_published ?? false,
      source: item.source || "manual",
      source_url: item.source_url,
      social_platform: item.social_platform,
      tryon_enabled: item.tryon_enabled ?? false,
    } as any).select().single();
    if (!error) await fetchItems();
    return { data, error };
  };

  const updateItem = async (id: string, updates: Partial<TailorCatalogueItem>) => {
    const { error } = await supabase.from("tailor_catalogue_items").update(updates as any).eq("id", id);
    if (!error) await fetchItems();
    return { error };
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("tailor_catalogue_items").delete().eq("id", id);
    if (!error) await fetchItems();
    return { error };
  };

  return { items, loading, addItem, updateItem, deleteItem, refetch: fetchItems };
};
