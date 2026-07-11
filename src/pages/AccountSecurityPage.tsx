import { PasskeysPanel } from "@/components/settings/PasskeysPanel";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { UserRound } from "lucide-react";

export default function AccountSecurityPage() {
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle().then(({ data }) => {
      setUsername((data?.username as string) ?? "");
    });
  }, [user]);

  const saveUsername = async () => {
    if (!user) return;
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
      toast.error("3–30 chars: letters, numbers, dot, underscore, hyphen");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message.includes("duplicate") ? "That username is taken" : error.message);
    else toast.success("Username saved");
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Account &amp; Security</h1>
        <p className="text-muted-foreground">Manage your username and sign-in methods.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" /> Username</CardTitle>
          <CardDescription>
            Your chosen public identifier. Your account ID is internal — you sign in with your
            email and password (or a passkey).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="username">Username</Label>
          <div className="flex gap-2">
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ada.tailor"
              maxLength={30}
            />
            <Button onClick={saveUsername} disabled={saving}>Save</Button>
          </div>
        </CardContent>
      </Card>

      <PasskeysPanel />
    </div>
  );
}