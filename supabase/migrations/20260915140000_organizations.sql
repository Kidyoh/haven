-- Organizations directory and incident referrals.
--
--  1. A richer organization profile: where it is, what it does, when it is open,
--     and whether it takes referrals. Deliberately no latitude/longitude: a
--     shelter's coordinates are a safe-house location, and the directory is
--     readable by every signed-in account.
--  2. Org admins can edit their own organization and see who belongs to it.
--  3. Incidents can be referred to an organization, and the receiving
--     organization moves the referral through referred → accepted/declined →
--     completed.

-- ---------------------------------------------------------------------------
-- 1. Organization profile
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS subcity TEXT,
  -- For a shelter this is a public intake point, never the safe house itself.
  -- The form says so; the database cannot tell the two apart.
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hours TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS accepts_referrals BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing rows were last touched when they were created.
UPDATE public.organizations SET updated_at = created_at;

-- `location` was a free-text "city, sub-city or address". It is superseded by
-- region / subcity / address; carry it over so nothing disappears from the UI.
-- No existing row can be a shelter (the type did not exist before this file).
UPDATE public.organizations SET address = location WHERE address IS NULL AND location IS NOT NULL;
COMMENT ON COLUMN public.organizations.location IS 'Deprecated: superseded by region, subcity and address.';

-- The old form offered fire and private security. Keep what they were in the
-- notes, then fold them into "other" so the constraint can apply.
UPDATE public.organizations
SET notes = concat_ws(E'\n', notes, format('Type was "%s" before the type list changed.', type)),
    type = 'other'
WHERE type NOT IN ('police', 'ngo', 'hospital', 'shelter', 'legal_aid', 'government', 'other');

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_type_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_type_check
  CHECK (type IN ('police', 'ngo', 'hospital', 'shelter', 'legal_aid', 'government', 'other'));

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Org admins
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so policies on user_roles can call it without recursing
-- into user_roles' own RLS (same pattern as has_role).
CREATE OR REPLACE FUNCTION public.is_org_admin_of(_user_id UUID, _organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'org_admin'
      AND organization_id = _organization_id
  )
$$;

-- Update, not delete. Admins keep full control through "Admins can manage organizations".
CREATE POLICY "Org admins can update their organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin_of(auth.uid(), id))
  WITH CHECK (public.is_org_admin_of(auth.uid(), id));

-- So an org admin can see their own members. Assigning members stays admin-only.
CREATE POLICY "Org admins can view roles in their organization"
  ON public.user_roles FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin_of(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 3. Referrals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  -- RESTRICT: an organization with referral history is deactivated, not deleted.
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  referred_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'referred' CHECK (status IN ('referred', 'accepted', 'declined', 'completed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One referral per incident per organization; a second click is a no-op, not a duplicate.
  UNIQUE (incident_id, organization_id)
);
ALTER TABLE public.incident_referrals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS incident_referrals_org_idx ON public.incident_referrals (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS incident_referrals_incident_idx ON public.incident_referrals (incident_id);

CREATE TRIGGER update_incident_referrals_updated_at
  BEFORE UPDATE ON public.incident_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Responders can view referrals"
  ON public.incident_referrals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'org_admin') OR public.has_role(auth.uid(), 'admin'));

-- Only to an organization that is open for referrals, and only in your own name.
CREATE POLICY "Responders can refer incidents"
  ON public.incident_referrals FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin'))
    AND referred_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id AND o.is_active AND o.accepts_referrals
    )
  );

CREATE POLICY "Admins and the receiving org admins can update referrals"
  ON public.incident_referrals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_org_admin_of(auth.uid(), organization_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_org_admin_of(auth.uid(), organization_id));

-- An update may only move the status or the note: who referred what, to whom,
-- is the record and stays as written.
REVOKE UPDATE ON public.incident_referrals FROM authenticated, anon;
GRANT UPDATE (status, note) ON public.incident_referrals TO authenticated;
