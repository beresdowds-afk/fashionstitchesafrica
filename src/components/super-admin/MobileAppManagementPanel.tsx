import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone, Download, Copy, Check, QrCode, Settings, Shield,
  RefreshCw, Globe, Bell, Palette, ExternalLink, Share2
} from "lucide-react";

const MobileAppManagementPanel = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const installUrl = `${window.location.origin}/install`;
  const portalUrl = `${window.location.origin}/portal`;
  const browseUrl = `${window.location.origin}/browse`;

  const copyLink = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: `${label} link copied!` });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Fashion Stitches Africa",
        text: "Download Fashion Stitches Africa – The operating system for African fashion commerce",
        url: installUrl,
      });
    } else {
      copyLink(installUrl, "Install");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Mobile App Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage the Fashion Stitches Africa PWA for Android & iOS devices.
        </p>
      </div>

      {/* App Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Smartphone, label: "App Status", value: "Live", color: "text-secondary", badge: "bg-secondary/10 text-secondary" },
          { icon: Globe, label: "Platform", value: "PWA (Android + iOS)", color: "text-primary", badge: "bg-primary/10 text-primary" },
          { icon: Shield, label: "Version", value: "1.0.0", color: "text-accent", badge: "bg-accent/10 text-accent-foreground" },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-card border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <Badge className={`${s.badge} text-xs`}>{s.value}</Badge>
          </div>
        ))}
      </div>

      {/* Shareable Download Link */}
      <div className="rounded-xl bg-card border border-primary/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download size={18} className="text-primary" />
          <h3 className="font-heading font-semibold">Shareable Download Link</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Share this link with users to install Fashion Stitches Africa on their mobile devices.
        </p>
        <div className="flex gap-2 mb-4">
          <Input value={installUrl} readOnly className="font-mono text-sm" />
          <Button variant="outline" size="sm" onClick={() => copyLink(installUrl, "Install")}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
          <Button variant="hero" size="sm" onClick={shareLink}>
            <Share2 size={14} className="mr-1" /> Share
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => copyLink(portalUrl, "Customer Portal")}>
            Customer Portal Link
          </Button>
          <Button variant="outline" size="sm" onClick={() => copyLink(browseUrl, "Browse")}>
            Browse Organizations Link
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(installUrl, "_blank")}>
            <ExternalLink size={14} className="mr-1" /> Preview
          </Button>
        </div>
      </div>

      {/* App Configuration */}
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={18} className="text-primary" />
          <h3 className="font-heading font-semibold">App Configuration</h3>
        </div>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Push Notifications</Label>
              <p className="text-xs text-muted-foreground">Enable browser push notifications for mobile users</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Offline Mode</Label>
              <p className="text-xs text-muted-foreground">Allow app to work offline with cached data</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Auto-Update</Label>
              <p className="text-xs text-muted-foreground">Automatically update app when new version is available</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Customer Self-Registration</Label>
              <p className="text-xs text-muted-foreground">Allow customers to browse and join organizations</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Inter-User Video Calls</Label>
              <p className="text-xs text-muted-foreground">Enable WebRTC video consultations between users</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </div>

      {/* App Info */}
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Palette size={18} className="text-secondary" />
          <h3 className="font-heading font-semibold">App Details</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">App Name</span>
            <p className="font-medium">Fashion Stitches Africa</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Short Name</span>
            <p className="font-medium">FSA</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Theme Color</span>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-primary" />
              <p className="font-medium font-mono">#C8963E</p>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Display Mode</span>
            <p className="font-medium">Standalone</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Orientation</span>
            <p className="font-medium">Portrait</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Categories</span>
            <p className="font-medium">Business, Lifestyle, Shopping</p>
          </div>
        </div>
      </div>

      {/* User Access Roles */}
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-accent" />
          <h3 className="font-heading font-semibold">User Access Roles (Mobile)</h3>
        </div>
        <div className="space-y-3">
          {[
            { role: "Customer", features: "Browse orgs, view catalogue, place orders, track orders, AI measurements, virtual try-on, video calls, payments", color: "bg-muted" },
            { role: "Tailor", features: "View assigned orders, update status, upload photos, chat with org, view contracts, earnings", color: "bg-secondary/10" },
            { role: "Org Admin", features: "Full dashboard, order management, team management, billing, communications, logistics", color: "bg-primary/10" },
          ].map(r => (
            <div key={r.role} className={`rounded-lg ${r.color} p-4`}>
              <p className="font-heading font-semibold text-sm mb-1">{r.role}</p>
              <p className="text-xs text-muted-foreground">{r.features}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default MobileAppManagementPanel;
