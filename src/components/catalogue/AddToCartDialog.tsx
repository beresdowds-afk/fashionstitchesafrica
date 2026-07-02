import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { addToCart } from "@/lib/cartFlow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Heart, ShoppingBag, Ruler } from "lucide-react";
import {
  SIZE_STANDARDS,
  SizeStandard,
  buildComparisonRows,
  WOMEN_SIZE_TABLE,
  MEN_SIZE_TABLE,
} from "@/lib/sizeCharts";

interface CatalogueProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number | null;
  currency?: string | null;
  image_url?: string | null;
  category?: string | null;
  available_sizes?: string[] | null;
  size_chart_standard?: string | null;
  size_chart?: Record<string, any> | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  product: CatalogueProduct | null;
  defaultCurrency: string;
}

export const AddToCartDialog = ({ open, onOpenChange, orgId, product, defaultCurrency }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [chosenSize, setChosenSize] = useState<string | null>(null);
  const [displayStandard, setDisplayStandard] = useState<SizeStandard>("UK");
  const [busy, setBusy] = useState(false);

  const productStandard = ((product?.size_chart_standard as SizeStandard) || "UK");
  const sizes = product?.available_sizes ?? [];
  const table = (product?.category || "").toLowerCase().includes("men") ? MEN_SIZE_TABLE : WOMEN_SIZE_TABLE;
  const rows = useMemo(() => buildComparisonRows(productStandard, sizes, table), [productStandard, sizes, table]);

  if (!product) return null;
  const currency = product.currency || defaultCurrency;
  const price = Number(product.price ?? 0);

  const handleAdd = () => {
    if (sizes.length > 0 && !chosenSize) {
      toast({ title: "Select a size to continue", variant: "destructive" });
      return;
    }
    addToCart(
      orgId,
      {
        id: product.id,
        name: product.name,
        unit_price: price,
        currency,
        image_url: product.image_url ?? null,
        category: product.category ?? null,
        source: "org_catalogue",
        selected_size: chosenSize,
        size_standard: chosenSize ? productStandard : null,
      },
      qty,
    );
    toast({ title: "Added to cart", description: `${product.name}${chosenSize ? ` — Size ${chosenSize}` : ""}` });
    onOpenChange(false);
    setQty(1);
    setChosenSize(null);
  };

  const handleWishlist = async () => {
    if (!user) {
      toast({ title: "Please sign in to save to wishlist", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("customer_wishlists").insert({
      user_id: user.id,
      org_id: orgId,
      catalogue_item_id: product.id,
    });
    setBusy(false);
    if (error && !`${error.message}`.toLowerCase().includes("duplicate")) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved to wishlist" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag size={16} /> {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-2xl font-medium">
                {price ? `${currency} ${price.toLocaleString()}` : "Price on request"}
              </div>
              {product.description && (
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{product.description}</p>
              )}
            </div>

            {sizes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider">
                    Size ({productStandard})
                  </label>
                  <Badge variant="outline" className="text-[10px]">
                    <Ruler size={10} className="mr-1" /> View chart below
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setChosenSize(s)}
                      className={`px-3 py-1.5 border rounded-md text-sm min-w-[3rem] transition-colors ${
                        chosenSize === s ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider">Qty</label>
              <input
                type="number"
                min={1}
                max={20}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>

        {sizes.length > 0 && (
          <div className="mt-3">
            <Tabs value={displayStandard} onValueChange={(v) => setDisplayStandard(v as SizeStandard)}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Size Chart
                </div>
                <TabsList className="h-8">
                  {SIZE_STANDARDS.map((std) => (
                    <TabsTrigger key={std} value={std} className="text-xs px-2">
                      {std}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {SIZE_STANDARDS.map((std) => (
                <TabsContent key={std} value={std}>
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-3 py-2">Product size ({productStandard})</th>
                          <th className="text-left px-3 py-2">{std} equivalent</th>
                          {product.size_chart && Object.keys(product.size_chart).length > 0 && (
                            <th className="text-left px-3 py-2">Measurements</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sizes.map((s, i) => (
                          <tr key={s} className="border-t">
                            <td className="px-3 py-2 font-medium">{s}</td>
                            <td className="px-3 py-2">{rows[i]?.[std]}</td>
                            {product.size_chart && Object.keys(product.size_chart).length > 0 && (
                              <td className="px-3 py-2 text-muted-foreground">
                                {(product.size_chart as any)?.[s] || "—"}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 justify-end">
          <Button variant="outline" onClick={handleWishlist} disabled={busy}>
            <Heart size={14} className="mr-1" /> Wishlist
          </Button>
          <Button onClick={handleAdd}>
            <ShoppingBag size={14} className="mr-1" /> Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddToCartDialog;