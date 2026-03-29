import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Smartphone, Monitor, Apple, TrendingUp, Building2 } from "lucide-react";

interface OrgDownloadStat {
  org_id: string;
  org_name: string;
  total: number;
  ios: number;
  android: number;
  desktop: number;
  last_download: string;
}

interface DownloadRow {
  id: string;
  org_id: string;
  platform: string;
  install_method: string;
  created_at: string;
  user_id: string | null;
}

const AppDownloadsPanel = () => {
  const [stats, setStats] = useState<OrgDownloadStat[]>([]);
  const [downloads, setDownloads] = useState<DownloadRow[]>([]);
  const [totalDownloads, setTotalDownloads] = useState(0);
  const [selectedOrg, setSelectedOrg] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch all downloads
      const { data: dlData } = await supabase
        .from("org_app_downloads" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500) as any;

      const allDownloads = (dlData || []) as DownloadRow[];
      setDownloads(allDownloads);
      setTotalDownloads(allDownloads.length);

      // Fetch org names
      const orgIds = [...new Set(allDownloads.map(d => d.org_id))];
      let orgMap: Record<string, string> = {};
      if (orgIds.length > 0) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name")
          .in("id", orgIds);
        (orgs || []).forEach((o: any) => { orgMap[o.id] = o.name; });
      }

      // Aggregate per org
      const orgStats: Record<string, OrgDownloadStat> = {};
      allDownloads.forEach(d => {
        if (!orgStats[d.org_id]) {
          orgStats[d.org_id] = {
            org_id: d.org_id,
            org_name: orgMap[d.org_id] || "Unknown",
            total: 0,
            ios: 0,
            android: 0,
            desktop: 0,
            last_download: d.created_at,
          };
        }
        orgStats[d.org_id].total++;
        if (d.platform === "ios") orgStats[d.org_id].ios++;
        else if (d.platform === "android") orgStats[d.org_id].android++;
        else orgStats[d.org_id].desktop++;
        if (d.created_at > orgStats[d.org_id].last_download) {
          orgStats[d.org_id].last_download = d.created_at;
        }
      });

      setStats(Object.values(orgStats).sort((a, b) => b.total - a.total));
      setLoading(false);
    };
    fetchData();
  }, []);

  const filteredDownloads = selectedOrg === "all"
    ? downloads
    : downloads.filter(d => d.org_id === selectedOrg);

  const platformIcon = (p: string) => {
    if (p === "ios") return <Apple size={14} className="text-gray-400" />;
    if (p === "android") return <Smartphone size={14} className="text-green-400" />;
    return <Monitor size={14} className="text-blue-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Download size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalDownloads}</p>
                <p className="text-xs text-muted-foreground">Total Downloads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Smartphone size={20} className="text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{downloads.filter(d => d.platform === "android").length}</p>
                <p className="text-xs text-muted-foreground">Android</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-500/10 flex items-center justify-center">
                <Apple size={20} className="text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{downloads.filter(d => d.platform === "ios").length}</p>
                <p className="text-xs text-muted-foreground">iOS</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Building2 size={20} className="text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.length}</p>
                <p className="text-xs text-muted-foreground">Orgs with Downloads</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Org Breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              Downloads by Organization
            </CardTitle>
            <Select value={selectedOrg} onValueChange={setSelectedOrg}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {stats.map(s => (
                  <SelectItem key={s.org_id} value={s.org_id}>{s.org_name} ({s.total})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No app downloads recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.map(s => (
                <div key={s.org_id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 size={14} className="text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.org_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Last: {new Date(s.last_download).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline" className="gap-1"><Smartphone size={10} /> {s.android}</Badge>
                      <Badge variant="outline" className="gap-1"><Apple size={10} /> {s.ios}</Badge>
                      <Badge variant="outline" className="gap-1"><Monitor size={10} /> {s.desktop}</Badge>
                    </div>
                    <span className="font-bold text-sm min-w-[2rem] text-right">{s.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Downloads Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Downloads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {filteredDownloads.slice(0, 50).map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-lg border text-sm">
                <div className="flex items-center gap-3">
                  {platformIcon(d.platform)}
                  <span className="capitalize">{d.platform}</span>
                  <Badge variant="secondary" className="text-[10px]">{d.install_method}</Badge>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground text-xs">
                  <span>{d.user_id ? "Authenticated" : "Anonymous"}</span>
                  <span>{new Date(d.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {filteredDownloads.length === 0 && (
              <p className="text-center text-muted-foreground py-6">No downloads found.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AppDownloadsPanel;
