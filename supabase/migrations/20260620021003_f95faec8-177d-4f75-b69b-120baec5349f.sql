
-- 1. attachments column on claim actions (used for chat messages with files)
ALTER TABLE public.insurance_claim_actions
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Storage RLS for chat attachments under insurance-evidence/chat/{claim_id}/...
-- We reuse the existing private bucket. Access matches insurance_claims access.
DROP POLICY IF EXISTS "insurance_evidence_chat_select" ON storage.objects;
DROP POLICY IF EXISTS "insurance_evidence_chat_insert" ON storage.objects;
DROP POLICY IF EXISTS "insurance_evidence_chat_delete" ON storage.objects;

CREATE POLICY "insurance_evidence_chat_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'insurance-evidence'
  AND (storage.foldername(name))[1] = 'chat'
  AND EXISTS (
    SELECT 1 FROM public.insurance_claims c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND (
        c.customer_id = auth.uid()
        OR c.submitted_by = auth.uid()
        OR c.tailor_id = auth.uid()
        OR (c.organization_id IS NOT NULL AND public.is_org_member(auth.uid(), c.organization_id))
        OR public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'super_assistant')
      )
  )
);

CREATE POLICY "insurance_evidence_chat_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'insurance-evidence'
  AND (storage.foldername(name))[1] = 'chat'
  AND EXISTS (
    SELECT 1 FROM public.insurance_claims c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND (
        c.customer_id = auth.uid()
        OR c.submitted_by = auth.uid()
        OR c.tailor_id = auth.uid()
        OR (c.organization_id IS NOT NULL AND public.is_org_member(auth.uid(), c.organization_id))
        OR public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'super_assistant')
      )
  )
);

CREATE POLICY "insurance_evidence_chat_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'insurance-evidence'
  AND (storage.foldername(name))[1] = 'chat'
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- 3. Notify on claim transitions: append rows to public.notifications
CREATE OR REPLACE FUNCTION public.notify_insurance_claim_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _title text;
  _msg text;
  _changed text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      _changed := 'status';
      _title := 'Claim ' || NEW.claim_number || ': status ' || replace(NEW.status::text, '_', ' ');
      _msg := 'Status changed from ' || replace(OLD.status::text, '_', ' ')
              || ' to ' || replace(NEW.status::text, '_', ' ') || '.';
    ELSIF COALESCE(NEW.evidence_status,'') IS DISTINCT FROM COALESCE(OLD.evidence_status,'') THEN
      _changed := 'evidence_status';
      _title := 'Claim ' || NEW.claim_number || ': evidence ' || COALESCE(NEW.evidence_status, 'updated');
      _msg := 'Evidence scan result: ' || COALESCE(NEW.evidence_status, 'updated') || '.';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Claimant (customer or submitter)
  IF NEW.customer_id IS NOT NULL THEN
    INSERT INTO public.notifications (org_id, user_id, order_id, title, message)
    VALUES (COALESCE(NEW.organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
            NEW.customer_id, NEW.order_id, _title, _msg);
  END IF;
  IF NEW.submitted_by IS NOT NULL AND NEW.submitted_by IS DISTINCT FROM NEW.customer_id THEN
    INSERT INTO public.notifications (org_id, user_id, order_id, title, message)
    VALUES (COALESCE(NEW.organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
            NEW.submitted_by, NEW.order_id, _title, _msg);
  END IF;

  -- Org admins / managers
  IF NEW.organization_id IS NOT NULL THEN
    INSERT INTO public.notifications (org_id, user_id, order_id, title, message)
    SELECT NEW.organization_id, m.user_id, NEW.order_id, _title, _msg
      FROM public.org_members m
     WHERE m.org_id = NEW.organization_id
       AND m.role IN ('org_admin', 'manager')
       AND m.is_active = true;
  END IF;

  -- Tailor
  IF NEW.tailor_id IS NOT NULL THEN
    INSERT INTO public.notifications (org_id, user_id, order_id, title, message)
    VALUES (COALESCE(NEW.organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
            NEW.tailor_id, NEW.order_id, _title, _msg);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break the underlying transition because of notification failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_insurance_claim_change ON public.insurance_claims;
CREATE TRIGGER trg_notify_insurance_claim_change
AFTER UPDATE ON public.insurance_claims
FOR EACH ROW EXECUTE FUNCTION public.notify_insurance_claim_change();

-- 4. Audit timeline RPC: joined with profiles for actor display name + role
CREATE OR REPLACE FUNCTION public.get_claim_audit_timeline(_claim_id uuid)
RETURNS TABLE (
  id uuid,
  action_type text,
  description text,
  attachments jsonb,
  metadata jsonb,
  created_at timestamptz,
  actor_id uuid,
  actor_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _allowed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.insurance_claims c
     WHERE c.id = _claim_id
       AND (
         c.customer_id = _uid
         OR c.submitted_by = _uid
         OR c.tailor_id = _uid
         OR (c.organization_id IS NOT NULL AND public.is_org_member(_uid, c.organization_id))
         OR public.has_role(_uid, 'super_admin')
         OR public.has_role(_uid, 'super_assistant')
       )
  ) INTO _allowed;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT a.id, a.action_type, a.description, a.attachments, a.metadata, a.created_at,
           a.performed_by,
           COALESCE(p.display_name, 'System') AS actor_name
      FROM public.insurance_claim_actions a
      LEFT JOIN public.profiles p ON p.id = a.performed_by
     WHERE a.claim_id = _claim_id
     ORDER BY a.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_claim_audit_timeline(uuid) TO authenticated;
