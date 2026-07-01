import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X } from "lucide-react";
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
}: ImageUrlFieldProps) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const isVideo = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(value || "");

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast({ title: "Unsupported file", description: "Upload an image or video.", variant: "destructive" });
      return;
    }
    if (file.size > maxFileMb * 1024 * 1024) {
      toast({ title: "File too large", description: `Max ${maxFileMb} MB`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${folder.replace(/\/+$/, "")}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
      toast({ title: "Uploaded", description: "File is ready to use." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Could not upload file.", variant: "destructive" });
    } finally {
      setUploading(false);
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
        if (f) handleFile(f);
      }}
    >
      <div
        className={`flex gap-2 rounded-lg transition ${
          dragOver ? "ring-2 ring-primary ring-offset-2 bg-primary/5 p-1" : ""
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
      <p className="mt-1 text-[10px] text-muted-foreground">
        Tip: drag &amp; drop an image or video here to upload.
      </p>
      {value && (
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
        accept="image/*,video/*"
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