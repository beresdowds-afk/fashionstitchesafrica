import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCreateClaim } from "@/hooks/useInsurance";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Upload, X, ShieldAlert, ArrowRight, ArrowLeft } from "lucide-react";
import type { InsuranceClaimType } from "@/lib/insurance/types";
import { useNavigate } from "react-router-dom";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30MB across all files
const ACCEPTED_PREFIXES = ["image/", "video/"];
const ACCEPTED_EXT = /\.(jpe?g|png|gif|webp|heic|heif|mp4|mov|webm|m4v)$/i;

function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const claimTypeOptions: { value: InsuranceClaimType; label: string; help: string }[] = [
  { value: "non_delivery", label: "Item never arrived", help: "Order shipped but never received" },
  { value: "delivery_failure", label: "Delivery failed", help: "Carrier returned or lost the parcel" },
  { value: "wrong_item", label: "Wrong item received", help: "Different design, fabric or size" },
  { value: "quality_issue", label: "Quality issue", help: "Damaged, defective or sub-standard" },
  { value: "measurement_error", label: "Measurement error", help: "Garment does not fit per spec" },
  { value: "fraud", label: "Suspected fraud", help: "Order or seller looks fraudulent" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  policy: {
    id: string;
    order_id: string | null;
    organization_id: string | null;
    tailor_id: string | null;
    coverage_limit: number;
    currency: string;
  };
  orderTitle?: string;
}

export default function ReportIssueDialog({ open, onOpenChange, policy, orderTitle }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const create = useCreateClaim();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [claimType, setClaimType] = useState<InsuranceClaimType | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setStep(1); setClaimType(""); setDescription(""); setFiles([]);
    Object.values(previews).forEach((u) => URL.revokeObjectURL(u));
    setPreviews({});
  };

  const totalBytes = files.reduce((a, f) => a + f.size, 0);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const accepted: File[] = [];
    let running = totalBytes;
    for (const f of Array.from(incoming)) {
      if (files.length + accepted.length >= MAX_FILES) {
        toast({ title: "Limit reached", description: `Max ${MAX_FILES} files`, variant: "destructive" });
        break;
      }
      const validType = ACCEPTED_PREFIXES.some((p) => f.type.startsWith(p)) || ACCEPTED_EXT.test(f.name);
      if (!validType) {
        toast({ title: "Unsupported file", description: `${f.name} must be an image or video`, variant: "destructive" });
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast({ title: "File too large", description: `${f.name} exceeds 10MB`, variant: "destructive" });
        continue;
      }
      if (running + f.size > MAX_TOTAL_BYTES) {
        toast({ title: "Total size exceeded", description: `Combined uploads cannot exceed ${humanSize(MAX_TOTAL_BYTES)}`, variant: "destructive" });
        break;
      }
      running += f.size;
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    setFiles((prev) => [...prev, ...accepted].slice(0, MAX_FILES));
    setPreviews((prev) => {
      const next = { ...prev };
      for (const f of accepted) {
        if (f.type.startsWith("image/") || f.type.startsWith("video/")) {
          next[`${f.name}-${f.size}-${f.lastModified}`] = URL.createObjectURL(f);
        }
      }
      return next;
    });
  };

  const removeFile = (i: number) => {
    const f = files[i];
    const key = `${f.name}-${f.size}-${f.lastModified}`;
    if (previews[key]) { URL.revokeObjectURL(previews[key]); }
    setPreviews((p) => { const c = { ...p }; delete c[key]; return c; });
    setFiles((p) => p.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (!claimType || !description.trim() || !user) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of files) {
        const path = `${user.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("insurance-evidence").upload(path, f, {
          contentType: f.type, upsert: false,
        });
        if (error) throw error;
        urls.push(path);
      }
      const claim = await create.mutateAsync({
        policyId: policy.id,
        orderId: policy.order_id ?? "",
        orgId: policy.organization_id,
        tailorId: policy.tailor_id,
        claimType,
        description: description.trim(),
        evidenceUrls: urls,
      });
      // Mark evidence queued for scanning (admin worker / antivirus will update later).
      try {
        await (supabase as any)
          .from("insurance_claims")
          .update({ evidence_status: urls.length > 0 ? "scanning" : "skipped" })
          .eq("id", claim.id);
      } catch { /* non-fatal */ }
      toast({ title: "Claim submitted", description: `Claim ${claim.claim_number} is under review.` });
      onOpenChange(false);
      reset();
      navigate(`/claims/${claim.id}`);
    } catch (e: any) {
      toast({ title: "Could not submit claim", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const selectedOption = claimTypeOptions.find((o) => o.value === claimType);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="text-[hsl(43,65%,38%)]" size={20} />
            Report an issue {orderTitle ? `· ${orderTitle}` : ""}
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {step === 1 ? "Issue type" : step === 2 ? "Details & evidence" : "Review & submit"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <Label>What happened?</Label>
            <Select value={claimType} onValueChange={(v) => setClaimType(v as InsuranceClaimType)}>
              <SelectTrigger><SelectValue placeholder="Choose an issue type" /></SelectTrigger>
              <SelectContent>
                {claimTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.help}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="desc">Describe the issue</Label>
              <Textarea id="desc" rows={4} maxLength={2000}
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide as much detail as possible…" />
            </div>
            <div>
              <Label>Photos / Videos ({files.length}/{MAX_FILES})</Label>
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-4 hover:bg-muted/50">
                <Upload size={20} className="text-muted-foreground" />
                <span className="mt-1 text-xs text-muted-foreground">
                  Up to {MAX_FILES} files · 10MB each
                </span>
                <input
                  type="file" multiple className="hidden"
                  accept="image/*,video/*"
                  disabled={files.length >= MAX_FILES}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                />
              </label>
              {files.length > 0 && (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {files.map((f, i) => {
                      const key = `${f.name}-${f.size}-${f.lastModified}`;
                      const url = previews[key];
                      return (
                        <div key={i} className="relative overflow-hidden rounded border border-border bg-muted/30">
                          {url && f.type.startsWith("image/") ? (
                            <img src={url} alt={f.name} className="h-20 w-full object-cover" />
                          ) : url && f.type.startsWith("video/") ? (
                            <video src={url} muted className="h-20 w-full object-cover" />
                          ) : (
                            <div className="flex h-20 items-center justify-center text-[10px] text-muted-foreground px-1 text-center">
                              {f.name}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${f.name}`}
                          >
                            <X size={12} />
                          </button>
                          <div className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-[10px]">
                            {humanSize(f.size)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Total {humanSize(totalBytes)} / {humanSize(MAX_TOTAL_BYTES)}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <p className="flex items-center gap-2 font-medium text-amber-700">
                <AlertTriangle size={14} /> Please confirm
              </p>
              <p className="mt-1 text-muted-foreground">
                False claims may void your protection and trigger account review.
              </p>
            </div>
            <dl className="space-y-2">
              <div><dt className="text-xs text-muted-foreground">Issue type</dt>
                <dd className="font-medium">{selectedOption?.label}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Description</dt>
                <dd className="whitespace-pre-wrap">{description}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Evidence files</dt>
                <dd>{files.length} file(s) attached</dd></div>
            </dl>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={uploading}>
              <ArrowLeft size={14} /> Back
            </Button>
          )}
          {step < 3 && (
            <Button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={(step === 1 && !claimType) || (step === 2 && description.trim().length < 10)}
            >
              Next <ArrowRight size={14} />
            </Button>
          )}
          {step === 3 && (
            <Button variant="hero" onClick={submit} disabled={uploading}>
              {uploading ? "Submitting…" : "Submit claim"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}