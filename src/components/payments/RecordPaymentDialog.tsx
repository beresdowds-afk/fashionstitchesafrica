import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface RecordPaymentDialogProps {
  orderId: string;
  currency: string;
  totalAmount: number;
  amountPaid: number;
  onRecord: (data: {
    order_id: string;
    amount: number;
    currency: string;
    payment_type: string;
    payment_method?: string;
    notes?: string;
  }) => Promise<{ error: any }>;
  children: React.ReactNode;
}

const RecordPaymentDialog = ({ orderId, currency, totalAmount, amountPaid, onRecord, children }: RecordPaymentDialogProps) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("full");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const balance = totalAmount - amountPaid;

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await onRecord({
      order_id: orderId,
      amount: numAmount,
      currency,
      payment_type: paymentType,
      payment_method: paymentMethod,
      notes: notes || undefined,
    });

    if (error) {
      toast({ title: "Error", description: (error as any).message, variant: "destructive" });
    } else {
      toast({ title: "Payment recorded" });
      setOpen(false);
      setAmount("");
      setNotes("");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex justify-between text-sm p-3 rounded-lg bg-muted/50 border border-border">
            <div>
              <p className="text-muted-foreground">Total</p>
              <p className="font-bold">{totalAmount.toLocaleString()} {currency}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Paid</p>
              <p className="font-bold text-secondary">{amountPaid.toLocaleString()} {currency}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Balance</p>
              <p className={`font-bold ${balance > 0 ? "text-accent" : "text-secondary"}`}>
                {balance.toLocaleString()} {currency}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount ({currency})</label>
            <Input
              type="number"
              placeholder={`e.g. ${balance > 0 ? balance.toLocaleString() : "0"}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Type</label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="full">Full Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Method</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Input
              placeholder="Payment reference or notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button variant="hero" className="w-full" onClick={handleSubmit} disabled={saving}>
            {saving ? "Recording..." : "Record Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RecordPaymentDialog;
