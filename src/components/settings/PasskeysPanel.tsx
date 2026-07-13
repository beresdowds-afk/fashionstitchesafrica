import { useEffect, useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Download } from "lucide-react";

/** Turn edge-function / WebAuthn errors into a user-friendly sentence. */
function friendlyPasskeyError(raw: unknown, phase: "register" | "authenticate"): string {
  const msg = (raw instanceof Error ? raw.message : String(raw ?? "")).trim();
  const lower = msg.toLowerCase();
  if (!msg) return phase === "register" ? "Could not enroll passkey — please try again." : "Passkey sign-in failed — please try again.";
  if (lower.includes("no active challenge") || lower.includes("expired") || lower.includes("challenge"))
    return "This passkey challenge expired before it was completed. Tap the button again to start a fresh challenge.";
  if (lower.includes("notallowed") || lower.includes("timed out") || lower.includes("timeout"))
    return "The device prompt was dismissed or timed out. Please retry and complete Face ID / Touch ID / security-key.";
  if (lower.includes("invalidstate") || lower.includes("already"))
    return "This device already has a passkey enrolled for your account. Remove the old one first, or use it to sign in.";
  if (lower.includes("no passkeys enrolled") || lower.includes("no passkeys available"))
    return "You haven't enrolled a passkey yet on any device. Enroll one first.";
  if (lower.includes("unknown passkey"))
    return "This passkey isn't recognised for your account. Enroll it again on this device.";
  if (lower.includes("verification failed"))
    return "Passkey signature verification failed. The device passkey may have been reset.";
  if (lower.includes("origin") || lower.includes("rpid"))
    return "Passkey origin mismatch — try again on the same domain you enrolled the passkey on.";
  if (lower.includes("authentication required") || lower.includes("invalid session"))
    return "Your session has expired. Sign in again with your email &amp; password, then retry.";
  return msg;
}

interface Passkey {
  id: string;
  credential_id: string;
  nickname: string | null;
  device_type: string | null;
  backed_up: boolean;
  last_used_at: string | null;
  created_at: string;
}

export function PasskeysPanel() {
  const { user } = useAuth();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [requireTwoFactor, setRequireTwoFactor] = useState(false);
  const [savingRequire, setSavingRequire] = useState(false);
  const [unusedBackupCodes, setUnusedBackupCodes] = useState(0);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<null | { title: string; body: string; onConfirm: () => void }>(null);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: prof }] = await Promise.all([
      supabase
      .from("webauthn_credentials")
      .select("id, credential_id, nickname, device_type, backed_up, last_used_at, created_at")
      .order("created_at", { ascending: false }),
      user
        ? (supabase.from("profiles") as any)
            .select("passkey_second_factor_required")
            .eq("id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    if (error) toast.error(error.message);
    else setPasskeys((data as Passkey[]) ?? []);
    setRequireTwoFactor(Boolean((prof as any)?.passkey_second_factor_required));
    setLoading(false);

    // Backup-code status is best-effort; hide the counter if the function isn't deployed yet.
    try {
      const { data: status } = await supabase.functions.invoke("passkey-recovery", { body: { action: "status" } });
      if (typeof (status as any)?.unused === "number") setUnusedBackupCodes((status as any).unused);
    } catch { /* ignore */ }
  };

  useEffect(() => { void load(); }, [user?.id]);

  const enroll = async () => {
    setEnrolling(true);
    try {
      const { data: begin, error: e1 } = await supabase.functions.invoke("passkey-register", {
        body: { action: "begin" },
      });
      if (e1 || !begin?.options) throw new Error((begin as any)?.error ?? e1?.message ?? "Failed to start enrollment");
      const attResp = await startRegistration(begin.options);
      const { data: fin, error: e2 } = await supabase.functions.invoke("passkey-register", {
        body: { action: "finish", response: attResp, nickname: nickname || null },
      });
      if (e2 || (fin as any)?.error) throw new Error((fin as any)?.error ?? e2?.message ?? "Enrollment failed");
      toast.success("Passkey enrolled on this device");
      setNickname("");
      await load();
    } catch (e) {
      toast.error(friendlyPasskeyError(e, "register"));
    } finally {
      setEnrolling(false);
    }
  };

  const testAuth = async () => {
    try {
      const { data: begin, error: e1 } = await supabase.functions.invoke("passkey-authenticate", {
        body: { action: "begin" },
      });
      if (e1 || !begin?.options) throw new Error((begin as any)?.error ?? e1?.message ?? "No passkeys available");
      const asResp = await startAuthentication(begin.options);
      const { data: fin, error: e2 } = await supabase.functions.invoke("passkey-authenticate", {
        body: { action: "finish", response: asResp },
      });
      if (e2 || !fin?.verified) throw new Error((fin as any)?.error ?? e2?.message ?? "Verification failed");
      toast.success("Passkey verified ✓");
      await load();
    } catch (e) {
      toast.error(friendlyPasskeyError(e, "authenticate"));
    }
  };

  const remove = async (id: string) => {
    if (requireTwoFactor && passkeys.length <= 1 && unusedBackupCodes === 0) {
      toast.error(
        "This is your last passkey and 2FA is on with no backup codes. Generate backup codes or turn off 2FA first — otherwise you'll be locked out."
      );
      return;
    }
    setConfirmDialog({
      title: "Remove this passkey?",
      body: "You won't be able to sign in with this device again until you enroll a new passkey here.",
      onConfirm: async () => {
        const { error } = await supabase.from("webauthn_credentials").delete().eq("id", id);
        if (error) toast.error(error.message);
        else {
          toast.success("Passkey removed");
          await load();
        }
      },
    });
  };

  const toggleRequire = async (next: boolean) => {
    if (!user) return;
    // Block BOTH enabling and disabling when the account has zero passkeys:
    // enabling with 0 = immediate lockout; disabling with 0 usually means the
    // user already can't sign in and should use a backup code instead.
    if (passkeys.length === 0) {
      toast.error(
        next
          ? "Enroll at least one passkey below before requiring it as a second factor."
          : "You have no passkeys enrolled. Enroll one first, or use a backup code from the sign-in screen to recover access."
      );
      return;
    }
    if (next && unusedBackupCodes === 0) {
      // Prompt but don't block — strongly encourage generating backup codes.
      setConfirmDialog({
        title: "Turn on passkey 2FA without backup codes?",
        body: "Backup codes let you sign in if you lose every enrolled passkey. We strongly recommend generating them before enabling 2FA.",
        onConfirm: () => void applyRequire(true),
      });
      return;
    }
    await applyRequire(next);
  };

  const applyRequire = async (next: boolean) => {
    if (!user) return;
    setSavingRequire(true);
    const { error } = await supabase
      .from("profiles")
      .update({ passkey_second_factor_required: next } as any)
      .eq("id", user.id);
    setSavingRequire(false);
    if (error) toast.error(error.message);
    else {
      setRequireTwoFactor(next);
      toast.success(next ? "Passkey now required after email &amp; password sign-in" : "Passkey second factor disabled");
    }
  };

  const generateBackupCodes = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("passkey-recovery", { body: { action: "generate" } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message);
      setNewCodes((data as any).codes as string[]);
      await load();
      toast.success("10 backup codes generated — save them somewhere safe.");
    } catch (e) {
      toast.error((e as Error).message ?? "Could not generate backup codes.");
    } finally {
      setGenerating(false);
    }
  };

  const copyCodes = async () => {
    if (!newCodes) return;
    await navigator.clipboard.writeText(newCodes.join("\n"));
    toast.success("Copied to clipboard");
  };

  const downloadCodes = () => {
    if (!newCodes) return;
    const blob = new Blob(
      [`FYSORA FASHN — Passkey backup codes\nGenerated: ${new Date().toISOString()}\n\n${newCodes.join("\n")}\n\nEach code can be used once.\n`],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fysora-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Passkeys
        </CardTitle>
        <CardDescription>
          Add a passkey on each of your devices to sign in with Face ID, Touch ID, Windows Hello,
          or a security key. Passkeys are an additional layer on top of your username &amp; password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Device nickname (e.g. iPhone, MacBook)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={40}
            data-testid="passkey-nickname"
          />
          <Button onClick={enroll} disabled={enrolling} data-testid="passkey-enroll">
            {enrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
            Enroll this device
          </Button>
        </div>

        <div className="border rounded-md divide-y" data-testid="passkey-list">
          {loading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
          {!loading && passkeys.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No passkeys enrolled yet.</div>
          )}
          {passkeys.map((pk) => (
            <div key={pk.id} className="p-3 flex items-center justify-between gap-2" data-testid="passkey-item">
              <div className="min-w-0">
                <div className="font-medium truncate">{pk.nickname || "Unnamed passkey"}</div>
                <div className="text-xs text-muted-foreground">
                  {pk.device_type ?? "device"}
                  {pk.backed_up ? " · synced" : " · this device only"}
                  {pk.last_used_at ? ` · last used ${new Date(pk.last_used_at).toLocaleDateString()}` : " · never used"}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(pk.id)} aria-label="Remove passkey">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {passkeys.length > 0 && (
          <Button variant="outline" onClick={testAuth} data-testid="passkey-test">Test passkey sign-in</Button>
        )}

        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="require-passkey-2fa" className="font-medium">Require passkey after sign-in</Label>
            <p className="text-xs text-muted-foreground">
              When on, after signing in with your email &amp; password we'll also ask for a passkey.
              Email &amp; password remain your fallback.
            </p>
          </div>
          <Switch
            id="require-passkey-2fa"
            checked={requireTwoFactor}
            disabled={savingRequire}
            onCheckedChange={toggleRequire}
            data-testid="passkey-require-2fa"
          />
        </div>

        {/* Backup codes */}
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="font-medium">Backup codes</Label>
              <p className="text-xs text-muted-foreground">
                One-time codes that let you sign in even if you lose every passkey.
                {unusedBackupCodes > 0
                  ? ` You have ${unusedBackupCodes} unused code${unusedBackupCodes === 1 ? "" : "s"}.`
                  : " You have no backup codes yet."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setConfirmDialog({
                  title: unusedBackupCodes > 0 ? "Replace existing backup codes?" : "Generate backup codes?",
                  body:
                    unusedBackupCodes > 0
                      ? "Any existing unused codes will stop working. You'll be shown 10 new codes once — save them immediately."
                      : "You'll be shown 10 one-time codes. Store them somewhere safe (password manager, printed copy). Each code works once.",
                  onConfirm: () => void generateBackupCodes(),
                })
              }
              disabled={generating}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : unusedBackupCodes > 0 ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {newCodes && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium text-destructive">
                These codes will not be shown again. Save them now.
              </p>
              <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
                {newCodes.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyCodes}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
                <Button size="sm" variant="outline" onClick={downloadCodes}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Download
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNewCodes(null)}>I've saved them</Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    <AlertDialog open={confirmDialog !== null} onOpenChange={(o) => !o && setConfirmDialog(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmDialog?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              confirmDialog?.onConfirm();
              setConfirmDialog(null);
            }}
          >
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

export default PasskeysPanel;