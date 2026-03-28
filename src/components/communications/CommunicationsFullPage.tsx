import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Inbox, MessageSquare, Megaphone, Settings, Route, UserCog, Phone, Wallet, Activity, History } from "lucide-react";
import NotificationSettingsPanel from "./NotificationSettingsPanel";
import MessageLogViewer from "./MessageLogViewer";
import UserNotificationPreferences from "./UserNotificationPreferences";
import MessageInbox from "./MessageInbox";
import RoutingRulesPanel from "./RoutingRulesPanel";
import CallHistoryPanel from "./CallHistoryPanel";
import VoipBillingPanel from "./VoipBillingPanel";
import WhatChimpPanel from "./WhatChimpPanel";
import TermiiServicesPanel from "./TermiiServicesPanel";
import CommsMonitoringPanel from "./CommsMonitoringPanel";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OrgOption {
  id: string;
  name: string;
}

const sections = [
  { id: "inbox", icon: Inbox, label: "Inbox", description: "View and manage incoming messages across all channels" },
  { id: "whatchimp", icon: MessageSquare, label: "WhatsApp & Social", description: "WhatChimp integration for WhatsApp Business and social media" },
  { id: "termii", icon: Megaphone, label: "Termii Services", description: "SMS gateway, OTP verification, and voice services" },
  { id: "settings", icon: Settings, label: "Org Settings", description: "Configure notification channels and branding" },
  { id: "routing", icon: Route, label: "Routing Rules", description: "Smart message routing and channel prioritization" },
  { id: "preferences", icon: UserCog, label: "My Preferences", description: "Personal notification and delivery preferences" },
  { id: "calls", icon: Phone, label: "Calls", description: "Call history, recordings, and VoIP management" },
  { id: "voip-billing", icon: Wallet, label: "VoIP Billing", description: "Voice call billing records and usage analytics" },
  { id: "monitoring", icon: Activity, label: "Monitoring", description: "Real-time provider health and delivery metrics" },
  { id: "logs", icon: History, label: "Message Log", description: "Full audit trail of all sent and received messages" },
];

const CommunicationsFullPage = () => {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  useEffect(() => {
    const fetchOrgs = async () => {
      const { data } = await supabase.from("organizations").select("id, name").order("name").limit(100);
      if (data && data.length > 0) {
        setOrgs(data);
        setSelectedOrgId(data[0].id);
      }
    };
    fetchOrgs();
  }, []);

  const renderContent = (id: string) => {
    if (!selectedOrgId) return <p className="text-muted-foreground text-sm">Select an organization first.</p>;
    switch (id) {
      case "inbox": return <MessageInbox orgId={selectedOrgId} />;
      case "whatchimp": return <WhatChimpPanel orgId={selectedOrgId} role="super_admin" />;
      case "termii": return <TermiiServicesPanel orgId={selectedOrgId} role="super_admin" />;
      case "settings": return <NotificationSettingsPanel orgId={selectedOrgId} isAdmin={true} />;
      case "routing": return <RoutingRulesPanel orgId={selectedOrgId} />;
      case "preferences": return <UserNotificationPreferences orgId={selectedOrgId} />;
      case "calls": return <CallHistoryPanel orgId={selectedOrgId} />;
      case "voip-billing": return <VoipBillingPanel orgId={selectedOrgId} role="super_admin" />;
      case "monitoring": return <CommsMonitoringPanel />;
      case "logs": return <MessageLogViewer orgId={selectedOrgId} />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-heading font-bold text-2xl">Communications Hub</h2>
          <p className="text-sm text-muted-foreground">Manage all communication channels, routing, and monitoring across organizations.</p>
        </div>
        <div className="w-full sm:w-64">
          <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger>
              <SelectValue placeholder="Select organization" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((org) => (
                <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sections.map((section) => (
          <Accordion key={section.id} type="single" collapsible className="rounded-xl border border-border bg-card">
            <AccordionItem value={section.id} className="border-0">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <section.icon size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{section.label}</p>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {renderContent(section.id)}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </div>
    </div>
  );
};

export default CommunicationsFullPage;
