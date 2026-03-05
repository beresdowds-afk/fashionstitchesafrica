import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, Scissors, Globe, Trash2, ExternalLink, Tag } from "lucide-react";
import { useTailorCatalogue } from "@/hooks/useTailorCatalogue";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SocialSyncPanel from "./SocialSyncPanel";

interface TailorCatalogueManagerProps {
  tailorId: string;
  orgId?: string;
}

const CATEGORIES = ["Suits", "Shirts", "Trousers", "Dresses", "Traditional", "Accessories", "Outerwear", "General"];

const TailorCatalogueManager = ({ tailorId, orgId }: TailorCatalogueManagerProps) => {
  const { items, loading, addItem, updateItem, deleteItem } = useTailorCatalogue(tailorId);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "General", price: "", tags: "" });
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "sync">("items");

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    const { error } = await addItem({
      name: form.name,
      description: form.description,
      category: form.category,
      price: form.price ? parseFloat(form.price) : undefined,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      org_id: orgId,
    });
    if (error) toast({ title: "Failed to add item", variant: "destructive" });
    else {
      toast({ title: "Item added to catalogue" });
      setShowAdd(false);
      setForm({ name: "", description: "", category: "General", price: "", tags: "" });
    }
  };

  const handleImageUpload = async (itemId: string, file: File) => {
    setUploading(true);
    const path = `tailor/${tailorId}/${itemId}/${file.name}`;
    const { error: uploadError } = await supabase.storage.from("garment-images").upload(path, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Upload failed", variant: "destructive" });
    } else {
      const { data } = supabase.storage.from("garment-images").getPublicUrl(path);
      await updateItem(itemId, { image_url: data.publicUrl });
      toast({ title: "Image uploaded" });
    }
    setUploading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button size="sm" variant={activeTab === "items" ? "default" : "outline"} onClick={() => setActiveTab("items")}>
          <Scissors size={14} className="mr-1" /> My Catalogue
        </Button>
        <Button size="sm" variant={activeTab === "sync" ? "default" : "outline"} onClick={() => setActiveTab("sync")}>
          <Globe size={14} className="mr-1" /> Social Sync
        </Button>
      </div>

      {activeTab === "sync" ? (
        <SocialSyncPanel ownerId={tailorId} ownerType="tailor" orgId={orgId} />
      ) : (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Scissors size={18} className="text-primary" />
              <h3 className="font-heading font-semibold text-lg">My Catalogue</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{items.length} items</Badge>
              <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus size={14} className="mr-1" /> Add Item</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Catalogue Item</DialogTitle></DialogHeader>
                  <div className="space-y-3 mt-2">
                    <Input placeholder="Item name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    <Textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                    <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Price (optional)" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                    <Input placeholder="Tags (comma-separated)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
                    <Button onClick={handleAdd} className="w-full">Add Item</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            <ExternalLink size={12} />
            <span>Your public catalogue: <code className="font-mono text-primary">/catalogue/tailor/{tailorId.slice(0, 8)}...</code></span>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No items yet. Add your first catalogue item or sync from social media.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(item => (
                <div key={item.id} className="rounded-lg border border-border overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-muted/30 flex flex-col items-center justify-center cursor-pointer"
                      onClick={() => { fileRef.current?.setAttribute("data-item-id", item.id); fileRef.current?.click(); }}>
                      <Upload size={24} className="text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Upload image</span>
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm truncate">{item.name}</h4>
                      {item.price && <span className="text-xs font-medium text-primary">{item.currency} {item.price}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                      {item.is_published && <Badge variant="secondary" className="text-[10px]"><Globe size={8} className="mr-0.5" /> Published</Badge>}
                      {item.source !== "manual" && (
                        <Badge variant="outline" className="text-[10px]">{item.social_platform || item.source}</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <label className="flex items-center gap-1 text-[10px]">
                        <Switch checked={item.is_published} onCheckedChange={v => updateItem(item.id, { is_published: v })} className="scale-75" />
                        Publish
                      </label>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteItem(item.id)}>
                        <Trash2 size={10} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const file = e.target.files?.[0];
            const itemId = fileRef.current?.getAttribute("data-item-id");
            if (file && itemId) handleImageUpload(itemId, file);
          }} />
        </Card>
      )}
    </div>
  );
};

export default TailorCatalogueManager;
