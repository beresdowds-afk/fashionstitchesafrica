import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Link2, Copy, MessageCircle, Download, Loader2, Image, FileText } from "lucide-react";
import jsPDF from "jspdf";
import { format } from "date-fns";

interface InvoiceData {
  id: string;
  invoice_number: string;
  recipient_name: string;
  recipient_email: string | null;
  recipient_type: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  due_date: string | null;
  notes: string | null;
  payment_terms: string | null;
  status: string;
  created_at: string;
  org_id: string | null;
}

interface ForwardInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceData | null;
  issuerName: string;
}

const ForwardInvoiceDialog = ({ open, onOpenChange, invoice, issuerName }: ForwardInvoiceDialogProps) => {
  const { toast } = useToast();
  const [customerEmail, setCustomerEmail] = useState("");
  const [message, setMessage] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "jpg">("pdf");
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  if (!invoice) return null;

  const buildPdfDoc = async () => {
    const { data: items } = await supabase
      .from("custom_invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("sort_order");

    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(issuerName, 20, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text("INVOICE", pw - 20, 20, { align: "right" });
    doc.setFontSize(8);
    doc.text(`Invoice #: ${invoice.invoice_number}`, pw - 20, 27, { align: "right" });
    doc.text(`Date: ${format(new Date(invoice.created_at), "MMM d, yyyy")}`, pw - 20, 33, { align: "right" });
    if (invoice.due_date) {
      doc.text(`Due: ${format(new Date(invoice.due_date), "MMM d, yyyy")}`, pw - 20, 39, { align: "right" });
    }

    doc.setTextColor(50);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Bill To:", 20, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(invoice.recipient_name, 20, y);
    y += 4;
    if (invoice.recipient_email) {
      doc.setFontSize(8);
      doc.text(invoice.recipient_email, 20, y);
      y += 4;
    }
    y += 6;

    doc.setDrawColor(200);
    doc.line(20, y, pw - 20, y);
    y += 8;

    doc.setFillColor(245, 245, 245);
    doc.rect(20, y, pw - 40, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(50);
    doc.text("Description", 22, y + 5.5);
    doc.text("Qty", 110, y + 5.5);
    doc.text("Unit Price", 130, y + 5.5);
    doc.text("Total", pw - 22, y + 5.5, { align: "right" });
    y += 12;

    doc.setFont("helvetica", "normal");
    (items || []).forEach((item: any) => {
      doc.text(item.description, 22, y);
      doc.text(String(Number(item.quantity)), 110, y);
      doc.text(`${invoice.currency} ${Number(item.unit_price).toLocaleString()}`, 130, y);
      doc.text(`${invoice.currency} ${Number(item.total).toLocaleString()}`, pw - 22, y, { align: "right" });
      y += 6;
    });

    y += 4;
    doc.line(20, y, pw - 20, y);
    y += 6;

    doc.setFontSize(9);
    doc.text("Subtotal:", pw - 70, y);
    doc.text(`${invoice.currency} ${Number(invoice.subtotal).toLocaleString()}`, pw - 22, y, { align: "right" });
    y += 5;

    if (Number(invoice.tax_amount) > 0) {
      doc.text(`Tax (${Number(invoice.tax_rate)}%):`, pw - 70, y);
      doc.text(`${invoice.currency} ${Number(invoice.tax_amount).toLocaleString()}`, pw - 22, y, { align: "right" });
      y += 5;
    }
    if (Number(invoice.discount_amount) > 0) {
      doc.text("Discount:", pw - 70, y);
      doc.text(`-${invoice.currency} ${Number(invoice.discount_amount).toLocaleString()}`, pw - 22, y, { align: "right" });
      y += 5;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Total:", pw - 70, y + 2);
    doc.text(`${invoice.currency} ${Number(invoice.total_amount).toLocaleString()}`, pw - 22, y + 2, { align: "right" });
    y += 10;

    if (invoice.payment_terms) {
      y += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(50);
      doc.text("Payment Terms", 20, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(80);
      const lines = doc.splitTextToSize(invoice.payment_terms, pw - 40);
      doc.text(lines, 20, y);
    }

    if (invoice.notes) {
      y += 10;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120);
      const noteLines = doc.splitTextToSize(invoice.notes, pw - 40);
      doc.text(noteLines, 20, y);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Status: ${invoice.status.toUpperCase()}`, 20, doc.internal.pageSize.getHeight() - 15);
    doc.text(`Generated on ${format(new Date(), "MMM d, yyyy")}`, pw - 20, doc.internal.pageSize.getHeight() - 15, { align: "right" });

    return doc;
  };

  const pdfToJpgBlob = async (doc: jsPDF): Promise<Blob> => {
    // Render the PDF page onto a canvas using an SVG intermediary
    const pdfDataUri = doc.output("datauristring");
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const scale = 3; // high-res
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(pw * scale);
    canvas.height = Math.round(ph * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return new Promise<Blob>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")),
          "image/jpeg",
          0.92
        );
      };
      img.onerror = () => reject(new Error("Failed to render invoice as image"));
      img.src = pdfDataUri;
    });
  };

  const generateAndUpload = async (): Promise<string> => {
    const doc = await buildPdfDoc();
    const ext = exportFormat === "jpg" ? "jpg" : "pdf";
    const fileName = `invoices/${invoice.id}/${invoice.invoice_number}.${ext}`;

    if (exportFormat === "pdf") {
      const pdfBlob = doc.output("blob");
      const { error } = await supabase.storage
        .from("org-assets")
        .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
    } else {
      const jpgBlob = await pdfToJpgBlob(doc);
      const { error } = await supabase.storage
        .from("org-assets")
        .upload(fileName, jpgBlob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
    }

    const { data: urlData } = supabase.storage.from("org-assets").getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const handleGenerateLink = async () => {
    setGenerating(true);
    try {
      const url = await generateAndUpload();
      setShareUrl(url);
      toast({ title: "Invoice uploaded", description: "Share link is ready!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleCopyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied to clipboard" });
    }
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const doc = await buildPdfDoc();
      if (exportFormat === "pdf") {
        doc.save(`${invoice.invoice_number}.pdf`);
      } else {
        const jpgBlob = await pdfToJpgBlob(doc);
        const url = URL.createObjectURL(jpgBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${invoice.invoice_number}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleEmailForward = () => {
    const email = customerEmail || invoice.recipient_email || "";
    const subject = encodeURIComponent(`Invoice ${invoice.invoice_number} from ${issuerName}`);
    const bodyText = encodeURIComponent(
      `${message ? message + "\n\n" : ""}Invoice: ${invoice.invoice_number}\nAmount Due: ${invoice.currency} ${Number(invoice.total_amount).toLocaleString()}${invoice.due_date ? `\nDue Date: ${format(new Date(invoice.due_date), "MMM d, yyyy")}` : ""}${shareUrl ? `\n\nView/Download Invoice: ${shareUrl}` : ""}\n\nThank you for your business.\n${issuerName}`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${bodyText}`, "_blank");
  };

  const handleWhatsAppForward = () => {
    const text = encodeURIComponent(
      `${message ? message + "\n\n" : ""}📄 Invoice ${invoice.invoice_number} from ${issuerName}\n💰 Amount: ${invoice.currency} ${Number(invoice.total_amount).toLocaleString()}${invoice.due_date ? `\n📅 Due: ${format(new Date(invoice.due_date), "MMM d, yyyy")}` : ""}${shareUrl ? `\n\n🔗 View/Download: ${shareUrl}` : ""}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const resetState = () => {
    setShareUrl(null);
    setCustomerEmail("");
    setMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail size={18} className="text-primary" />
            Forward Invoice
          </DialogTitle>
          <DialogDescription>
            Send invoice <span className="font-semibold">{invoice.invoice_number}</span> to your customer as PDF or image.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice summary */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">To:</span>
              <span className="font-medium">{invoice.recipient_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-heading font-bold">{invoice.currency} {Number(invoice.total_amount).toLocaleString()}</span>
            </div>
            {invoice.due_date && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Due:</span>
                <span>{format(new Date(invoice.due_date), "MMM d, yyyy")}</span>
              </div>
            )}
          </div>

          {/* Format */}
          <div>
            <Label>Export Format</Label>
            <Select value={exportFormat} onValueChange={(v) => { setExportFormat(v as "pdf" | "jpg"); setShareUrl(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">
                  <span className="flex items-center gap-2"><FileText size={14} /> PDF Document</span>
                </SelectItem>
                <SelectItem value="jpg">
                  <span className="flex items-center gap-2"><Image size={14} /> JPG Image</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Customer email */}
          <div>
            <Label>Customer Email</Label>
            <Input
              type="email"
              placeholder="customer@email.com"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>

          {/* Custom message */}
          <div>
            <Label>Message (optional)</Label>
            <Textarea
              placeholder="Add a personal note to your customer..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
            />
          </div>

          {/* Generate & share link */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGenerateLink}
              disabled={generating}
            >
              {generating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Link2 size={14} className="mr-2" />}
              Generate Shareable Link ({exportFormat.toUpperCase()})
            </Button>

            {shareUrl && (
              <div className="flex gap-2 items-center">
                <Input value={shareUrl} readOnly className="text-xs h-8" />
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyLink}>
                  <Copy size={14} />
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={generating}>
            <Download size={14} className="mr-1" /> Download {exportFormat.toUpperCase()}
          </Button>
          <Button variant="outline" size="sm" onClick={handleWhatsAppForward}>
            <MessageCircle size={14} className="mr-1" /> WhatsApp
          </Button>
          <Button size="sm" onClick={handleEmailForward}>
            <Mail size={14} className="mr-1" /> Send via Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ForwardInvoiceDialog;
