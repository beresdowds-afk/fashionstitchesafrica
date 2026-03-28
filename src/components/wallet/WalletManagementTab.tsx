import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, BarChart3 } from "lucide-react";
import CreditWalletPanel from "@/components/premium/CreditWalletPanel";
import PremiumUsagePanel from "@/components/premium/PremiumUsagePanel";

interface WalletManagementTabProps {
  orgId: string;
}

const WalletManagementTab = ({ orgId }: WalletManagementTabProps) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Wallet size={22} className="text-primary" />
        <h2 className="font-heading font-bold text-2xl">Wallet Management</h2>
      </div>

      <Tabs defaultValue="credits">
        <TabsList className="mb-6">
          <TabsTrigger value="credits" className="gap-2">
            <Wallet size={14} /> Credits
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 size={14} /> Usage & Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="credits">
          <CreditWalletPanel orgId={orgId} />
        </TabsContent>
        <TabsContent value="usage">
          <PremiumUsagePanel orgId={orgId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WalletManagementTab;
