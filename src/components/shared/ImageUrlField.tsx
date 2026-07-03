import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImageUrlFieldProps {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Storage bucket — defaults to org-assets (public). */
  bucket?: string;
  /** Optional folder prefix within the bucket. */
  folder?: string;
  /** Max file size in MB (default 10). */
  maxFileMb?: number;
  className?: string;
  inputId?: string;
  /** "image" only, "video" only, or "both" (default). */
  accept?: "image" | "video" | "both";
  /** Hide the preview thumbnail below the input. */
  hidePreview?: boolean;
}

/** Hybrid input: paste an image/media URL OR upload a file from device. */
const ImageUrlField = ({
  value,
  onChange,
  placeholder = "https://… or upload a file",
  disabled,
  bucket = "org-assets",
  folder = "uploads",
  maxFileMb = 10,
  className,
  inputId,
  accept = "both",
  hidePreview = false,
}: ImageUrlFieldProps) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragError, setDragError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const isVideo = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(value || "");

  const acceptAttr =
    accept === "image" ? "image/*" : accept === "video" ? "video/*" : "image/*,video/*";
  const acceptLabel =
    accept === "image" ? "an image" : accept === "video" ? "a video" : "an image or video";

  const isMimeAllowed = (mime: string) => {
    if (accept === "image") return mime.startsWith("image/");
    if (accept === "video") return mime.startsWith("video/");
    return mime.startsWith("image/") || mime.startsWith("video/");
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setDragError(null);
    if (!isMimeAllowed(file.type)) {
      const msg = `Unsupported file — please upload ${acceptLabel}.`;
      setDragError(msg);
      toast({ title: "Unsupported file", description: msg, variant: "destructive" });
      return;
    }
    if (file.size > maxFileMb * 1024 * 1024) {
      const msg = `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB — max ${maxFileMb} MB.`;
      setDragError(msg);
      toast({ title: "File too large", description: msg, variant: "destructive" });
      return;
    }
    setUploading(true);
    setProgress(5);
    // Fake a smooth progress bar while the upload runs (Supabase JS doesn't expose progress).
    const interval = window.setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, (95 - p) / 8) : p));
    }, 250);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${folder.replace(/\/+$/, "")}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) {
        // Surface server-side validation trigger messages verbatim.
        throw new Error(error.message || "Upload rejected by server.");
      }
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
      setProgress(100);
      toast({ title: "Uploaded", description: "File is ready to use." });
    } catch (err: any) {
      const msg = err?.message ?? "Could not upload file.";
      setDragError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      window.clearInterval(interval);
      setUploading(false);
      window.setTimeout(() => setProgress(0), 600);
    }
  };

  return (
    <div
      className={className}
      onDragOver={(e) => {
        if (disabled || uploading) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
        setDragError(null);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
      }}
      onDrop={(e) => {
        if (disabled || uploading) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        if (!isMimeAllowed(f.type)) {
          const msg = `That file isn't supported. Drop ${acceptLabel} (max ${maxFileMb} MB).`;
          setDragError(msg);
          toast({ title: "Unsupported file", description: msg, variant: "destructive" });
          return;
        }
        handleFile(f);
      }}
    >
      <div
        className={`flex gap-2 rounded-lg transition ${
          dragError
            ? "ring-2 ring-destructive ring-offset-2 bg-destructive/5 p-1"
            : dragOver
            ? "ring-2 ring-primary ring-offset-2 bg-primary/5 p-1"
            : ""
        }`}
      >
        <Input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || uploading}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
          title="Upload from device"
          className="shrink-0"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          <span className="ml-1 hidden sm:inline">Upload</span>
        </Button>
        {value && !uploading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange("")}
            title="Clear"
            className="shrink-0 text-muted-foreground"
          >
            <X size={14} />
          </Button>
        )}
      </div>
      {uploading && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Uploading… {Math.round(progress)}%</p>
        </div>
      )}
      {!uploading && dragError && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{dragError}</span>
        </p>
      )}
      {!uploading && !dragError && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Tip: drag &amp; drop {acceptLabel} here (max {maxFileMb} MB).
        </p>
      )}
      {value && !hidePreview && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          {isVideo ? (
            <video
              src={value}
              muted
              playsInline
              className="h-10 w-10 rounded border border-border object-cover bg-muted"
            />
          ) : (
            <img
              src={value}
              alt="Preview"
              onError={(e) => ((e.currentTarget.style.display = "none"))}
              className="h-10 w-10 rounded border border-border object-cover bg-muted"
            />
          )}
          <span className="truncate">{value}</span>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={acceptAttr}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default ImageUrlField;