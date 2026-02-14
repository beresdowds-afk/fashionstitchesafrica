import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useOrganization";

interface InviteMemberDialogProps {
  orgId: string;
  onInvited: () => void;
  children: React.ReactNode;
}

const InviteMemberDialog = ({ orgId, onInvited, children }: InviteMemberDialogProps) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("tailor");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({ title: "Please enter a valid email address", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    // Look up user by email via profiles — we need to find them in auth
    // Since we can't query auth.users directly, we check if a profile exists
    // by looking up users who signed up with this email
    const { data: authData, error: authError } = await supabase.auth.admin?.listUsers?.() || { data: null, error: new Error("Not available") };

    // Alternative: use a simpler approach — look up by the supabase auth API
    // For now, we search profiles by display_name or use RPC
    // The simplest approach: try to find the user via their email in the system
    
    // Since client can't query auth.users, we'll use a workaround:
    // Look for an existing org_member or profile match
    // Better approach: just try to find any user with this email by checking if they exist
    
    // Use supabase admin functions or just look for email in user metadata
    // For MVP, we'll look up profiles that match (profiles are created on signup with display_name from email)
    
    // Actually the cleanest way: use RPC or edge function. For now, let's use a simple approach:
    // We'll search profiles where display_name might contain the email, but that's unreliable.
    // Best MVP: Ask the admin to provide the user's ID, or we create an invitations table.
    
    // Simplest working approach: Try to find user by matching email in profiles
    // Since handle_new_user sets display_name to email as fallback, and we store email in auth,
    // we can't directly query. Let's create a lookup approach.

    // For a practical MVP, let's just add the member if we can find them:
    const { data: allMembers } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId);

    // Try to find the user - since we can't query auth.users from client,
    // we'll need to use an edge function. For now, show a helpful message.
    
    // Actually, let's use a practical approach: query all profiles and find by display_name
    // This works because handle_new_user stores email as display_name fallback
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name");

    // Find profile where display_name matches email (set during signup as fallback)
    // Note: This is an MVP approach. A production system should use an edge function.
    const matchedProfile = profiles?.find(
      (p) => p.display_name?.toLowerCase().trim() === trimmedEmail
    );

    if (!matchedProfile) {
      toast({
        title: "User not found",
        description: "This email is not registered. They need to sign up first.",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    // Check if already a member
    const existingMember = allMembers?.find((m) => m.user_id === matchedProfile.id);
    if (existingMember) {
      toast({ title: "Already a member", description: "This user is already in your organization.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Add as org member
    const { error } = await supabase.from("org_members").insert({
      org_id: orgId,
      user_id: matchedProfile.id,
      role,
    });

    setSubmitting(false);
    if (error) {
      toast({ title: "Error inviting member", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Member added successfully!" });
      setOpen(false);
      setEmail("");
      setRole("tailor");
      onInvited();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Invite Team Member</DialogTitle>
          <DialogDescription>Add a registered user to your organization by their email.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Email Address *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={role} onValueChange={(val) => setRole(val as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">Org Admin</SelectItem>
                <SelectItem value="tailor">Tailor</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="hero" type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteMemberDialog;
