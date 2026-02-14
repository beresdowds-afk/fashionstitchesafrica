import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { RefreshCw, Globe, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Rate {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  fetched_at: string;
}

const currencyNames: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  GHS: "Ghanaian Cedi",
  KES: "Kenyan Shilling",
  ZAR: "South African Rand",
};

const ExchangeRatesPanel = () => {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchRates = async () => {
    const { data } = await supabase
      .from("exchange_rates")
      .select("*")
      .eq("base_currency", "NGN")
      .order("target_currency");
    setRates((data as Rate[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRates(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-exchange-rates", {
        method: "POST",
      });
      if (error) throw error;
      toast({ title: "Rates synced", description: `${data?.rates_updated || 0} rates updated.` });
      await fetchRates();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    }
    setSyncing(false);
  };

  const lastFetched = rates.length > 0 ? new Date(rates[0].fetched_at) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl">Exchange Rates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live NGN exchange rates for currency conversion display.
          </p>
        </div>
        <Button variant="hero" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw size={14} className={`mr-1 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Now"}
        </Button>
      </div>

      {lastFetched && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock size={12} />
          Last updated: {lastFetched.toLocaleString()}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-medium">
            Auto-syncs daily
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rates.length === 0 ? (
        <div className="rounded-xl bg-card border border-border p-12 text-center">
          <Globe size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No exchange rates yet. Click "Sync Now" to fetch live rates.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rates.map((rate) => (
            <div
              key={rate.id}
              className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="font-heading font-bold text-xs text-primary">
                      {rate.target_currency}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{rate.target_currency}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {currencyNames[rate.target_currency] || rate.target_currency}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">1 NGN =</p>
                <p className="font-heading font-bold text-lg">
                  {rate.rate < 0.01 ? rate.rate.toFixed(6) : rate.rate.toFixed(4)} {rate.target_currency}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  1 {rate.target_currency} = {(1 / rate.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })} NGN
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default ExchangeRatesPanel;
