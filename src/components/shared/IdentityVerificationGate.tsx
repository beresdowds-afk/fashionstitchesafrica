import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2, AlertCircle, Loader2, Lock, Crown, Fingerprint, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";

const ID_TYPES_BY_COUNTRY: Record<string, { value: string; label: string; pattern: string }[]> = {
  NG: [
    { value: "nin", label: "National ID (NIN)", pattern: "11-digit number" },
    { value: "bvn", label: "BVN", pattern: "11-digit number" },
    { value: "passport", label: "International Passport", pattern: "Passport number" },
    { value: "drivers_license", label: "Driver's License", pattern: "License number" },
    { value: "voters_card", label: "Voter's Card", pattern: "VIN number" },
  ],
  GH: [
    { value: "ghana_card", label: "Ghana Card", pattern: "GHA-XXXXXXXXX-X" },
    { value: "passport", label: "Passport", pattern: "Passport number" },
  ],
  KE: [
    { value: "kenyan_id", label: "Kenyan National ID", pattern: "7-8 digit number" },
    { value: "passport", label: "Passport", pattern: "Passport number" },
  ],
  ZA: [
    { value: "sa_id", label: "South African ID", pattern: "13-digit number" },
    { value: "passport", label: "Passport", pattern: "Passport number" },
  ],
  OTHER: [
    { value: "passport", label: "International Passport", pattern: "Passport number" },
    { value: "national_id", label: "National ID", pattern: "ID number" },
    { value: "drivers_license", label: "Driver's License", pattern: "License number" },
  ],
};

const COUNTRIES = [
  { value: "NG", label: "🇳🇬 Nigeria" },
  { value: "GH", label: "🇬🇭 Ghana" },
  { value: "KE", label: "🇰🇪 Kenya" },
  { value: "ZA", label: "🇿🇦 South Africa" },
  { value: "OTHER", label: "🌍 Other" },
];

interface IdentityVerificationGateProps {
  children: React.ReactNode;
  featureLabel?: string;
}

export default function IdentityVerificationGate({ children, featureLabel = "this feature" }: IdentityVerificationGateProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("NG");
  const [identityType, setIdentityType] = useState("");
  const [identityNumber, setIdentityNumber] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [verificationProvider, setVerificationProvider] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: country, 2: id details, 3: result

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("identity_verified").eq("id", user.id).single(),
      supabase.from("customer_subscriptions" as any).select("id").eq("user_id", user.id).eq("status", "active").maybeSingle(),
    ]).then(([profileRes, subRes]) => {
      setVerified(!!(profileRes.data as any)?.identity_verified);
      setHasSubscription(!!subRes.data);
      setLoading(false);
    });
  }, [user]);

  const handleVerify = async () => {
    if (!identityNumber.trim() || !identityType || !user) return;
    setVerifying(true);
    setVerificationStatus("idle");
    setStep(3);

    try {
      const { data, error } = await supabase.functions.invoke("verify-identity", {
        body: {
          id_type: identityType,
          id_number: identityNumber.trim(),
          country,
          entity_type: "profile",
          entity_id: user.id,
        },
      });

      if (error || !data?.valid) {
        setVerificationStatus("invalid");
        setVerificationProvider(data?.provider || null);
        toast({ title: "Verification failed", description: data?.message || "Could not verify identity.", variant: "destructive" });
      } else {
        setVerificationStatus("valid");
        setVerificationProvider(data.provider);
        setConfidence(data.confidence || null);
        setVerified(true);
        toast({ title: "Identity verified", description: "You now have full access to platform features." });
      }
    } catch {
      setVerificationStatus("invalid");
      toast({ title: "Verification error", description: "Please check your details and try again.", variant: "destructive" });
    }
    setVerifying(false);
  };

  if (loading) return null;

  if (!hasSubscription) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-8 text-center max-w-md mx-auto mt-8">
        <Crown size={32} className="mx-auto text-primary mb-3" />
        <h3 className="font-heading font-bold text-lg mb-2">Premium Subscription Required</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Subscribe to the <span className="font-semibold text-foreground">$10/year Premium plan</span> to verify your identity and access {featureLabel}.
        </p>
        <Button variant="hero" onClick={() => {
          const tabsTrigger = document.querySelector('[value="subscription"]') as HTMLElement;
          if (tabsTrigger) tabsTrigger.click();
          else navigate("/portal");
        }}>
          <Crown size={14} className="mr-2" /> Go to Subscription
        </Button>
      </div>
    );
  }

  if (verified) return <>{children}</>;

  const idTypes = ID_TYPES_BY_COUNTRY[country] || ID_TYPES_BY_COUNTRY.OTHER;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-8 max-w-md mx-auto mt-8">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-3">
          <Fingerprint size={28} className="text-primary" />
        </div>
        <h3 className="font-heading font-bold text-lg mb-1">Identity Verification</h3>
        <p className="text-sm text-muted-foreground">
          Verify your identity to access {featureLabel}. This is a one-time process.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex-1">
            <div className={`h-1.5 rounded-full transition-colors ${step >= s ? "bg-primary" : "bg-muted"}`} />
          </div>
        ))}
      </div>

      <div className="space-y-4 text-left">
        {/* Step 1: Country */}
        {step >= 1 && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Globe size={12} className="text-muted-foreground" /> Country
            </Label>
            <Select value={country} onValueChange={(v) => {
              setCountry(v);
              setIdentityType("");
              setVerificationStatus("idle");
              if (step < 2) setStep(2);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Step 2: ID selection */}
        {step >= 2 && (
          <>
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Shield size={12} className="text-muted-foreground" /> ID Type
              </Label>
              <Select value={identityType} onValueChange={(v) => {
                setIdentityType(v);
                setVerificationStatus("idle");
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ID type" />
                </SelectTrigger>
                <SelectContent>
                  {idTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">ID Number</Label>
              <div className="flex gap-2">
                <Input
                  value={identityNumber}
                  onChange={(e) => { setIdentityNumber(e.target.value); setVerificationStatus("idle"); }}
                  placeholder={idTypes.find((t) => t.value === identityType)?.pattern || "Enter ID number"}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleVerify}
                  disabled={verifying || !identityType || !identityNumber.trim()}
                  className="shrink-0"
                >
                  {verifying ? <Loader2 size={14} className="animate-spin mr-1" /> : <Shield size={14} className="mr-1" />}
                  {verifying ? "Verifying..." : "Verify"}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Result */}
        {verifying && (
          <div className="rounded-lg bg-muted/50 p-4 text-center space-y-2">
            <Loader2 size={20} className="animate-spin mx-auto text-primary" />
            <p className="text-xs text-muted-foreground">Verifying your identity...</p>
            <Progress value={65} className="h-1" />
          </div>
        )}

        {verificationStatus === "valid" && (
          <div className="rounded-lg bg-secondary/10 border border-secondary/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-secondary" />
              <span className="text-sm font-medium text-secondary">Identity Verified</span>
            </div>
            {verificationProvider && (
              <p className="text-xs text-muted-foreground">
                Provider: <span className="capitalize">{verificationProvider.replace(/_/g, " ")}</span>
                {confidence && ` • Confidence: ${confidence}%`}
              </p>
            )}
          </div>
        )}

        {verificationStatus === "invalid" && !verifying && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-destructive" />
              <span className="text-sm font-medium text-destructive">Verification Failed</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Please check your details and try again. Ensure your ID number matches the format expected for your selected ID type.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { setStep(2); setVerificationStatus("idle"); }}>
              Try Again
            </Button>
          </div>
        )}

        {/* Trust indicators */}
        <div className="pt-4 border-t border-border">
          <div className="flex items-center gap-4 justify-center text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Lock size={10} /> Encrypted</span>
            <span className="flex items-center gap-1"><Shield size={10} /> NDPR Compliant</span>
            <span className="flex items-center gap-1"><Fingerprint size={10} /> Biometric Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}
