-- SOS pipeline rework.
--
--  1. Close the share-link hole: the anon policies let anyone holding the public
--     anon key list every active share token, then every incident and location
--     for those users. Family links now go through get_tracking(token), which
--     checks the token and returns only what the tracking page shows.
--  2. Evidence is private. Playback goes through short-lived signed URLs.
--  3. Incidents are created when the countdown starts ('pending'), with a
--     client-generated id so queued writes can be retried safely.
--  4. Audio arrives as many short clips (incident_evidence), not one file.
--  5. SMS delivery is recorded per contact (alert_notifications) so retries
--     never text the same person twice.

-- ---------------------------------------------------------------------------
-- 1. Share-link hole
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read active shares by token" ON public.incident_shares;
DROP POLICY IF EXISTS "Anon can view incidents via share token" ON public.incidents;
DROP POLICY IF EXISTS "Anon can view locations via share token" ON public.location_updates;

-- ---------------------------------------------------------------------------
-- 2. Private evidence
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'evidence';
DROP POLICY IF EXISTS "Anon can read evidence" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 3. Incident lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_status_check CHECK (status IN ('pending', 'active', 'resolved', 'cancelled'));

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  -- Set when "I am safe" was entered with the duress PIN: the phone looks
  -- stood down, the alert is not. Never exposed to the tracking link.
  ADD COLUMN IF NOT EXISTS duress_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ;

-- When the fix was taken on the phone. created_at is when it reached the
-- server, which can be minutes later if it was queued offline.
ALTER TABLE public.location_updates ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS location_updates_incident_idx ON public.location_updates (incident_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Audio clips
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, seq)
);
ALTER TABLE public.incident_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can add their own evidence"
  ON public.incident_evidence FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own evidence"
  ON public.incident_evidence FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Responders can view all evidence"
  ON public.incident_evidence FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'org_admin') OR public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 5. SMS delivery log (written only by the send-alert function)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.emergency_contacts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('alert', 'safe')),
  channel TEXT NOT NULL DEFAULT 'sms',
  to_phone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  provider TEXT,
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, contact_id, kind)
);
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.alert_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Responders can view all notifications"
  ON public.alert_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'org_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_alert_notifications_updated_at
  BEFORE UPDATE ON public.alert_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Family tracking link
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tracking(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share public.incident_shares%ROWTYPE;
  v_first_name TEXT;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_share FROM public.incident_shares WHERE share_token = p_token AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(split_part(full_name, ' ', 1), '') INTO v_first_name
  FROM public.profiles WHERE user_id = v_share.user_id;

  RETURN jsonb_build_object(
    'label', v_share.label,
    'first_name', v_first_name,
    'incidents', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'reference_number', i.reference_number,
          'status', i.status,
          'created_at', COALESCE(i.activated_at, i.created_at),
          'resolved_at', i.resolved_at,
          'latitude', i.latitude,
          'longitude', i.longitude,
          'accuracy_meters', i.accuracy_meters,
          'last_location_at', i.last_location_at,
          'trail', CASE WHEN i.status = 'active' THEN COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'latitude', l.latitude,
                'longitude', l.longitude,
                'accuracy_meters', l.accuracy_meters,
                'at', l.at
              ) ORDER BY l.at DESC
            )
            FROM (
              SELECT latitude, longitude, accuracy_meters, COALESCE(recorded_at, created_at) AS at
              FROM public.location_updates
              WHERE incident_id = i.id
              ORDER BY COALESCE(recorded_at, created_at) DESC
              LIMIT 20
            ) l
          ), '[]'::jsonb) ELSE '[]'::jsonb END
        ) ORDER BY i.created_at DESC
      )
      FROM (
        SELECT * FROM public.incidents
        WHERE user_id = v_share.user_id AND status IN ('active', 'resolved')
        ORDER BY created_at DESC
        LIMIT 20
      ) i
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tracking(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tracking(TEXT) TO anon, authenticated;
