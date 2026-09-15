-- Analytics for the response dashboard.
--
-- One row per incident, with the counts the analytics tab needs already joined
-- in (texts sent, clips recorded, location fixes). Aggregating per incident on
-- the server keeps the payload small and avoids PostgREST's row cap on the
-- child tables, which hold dozens of rows per alert. The charts themselves are
-- computed on the client from these rows, so every chart agrees with the others.

CREATE OR REPLACE FUNCTION public.get_incident_analytics(p_since TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  duress_at TIMESTAMPTZ,
  battery_level INTEGER,
  signal_strength TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_meters DOUBLE PRECISION,
  location_fixes INTEGER,
  clips INTEGER,
  audio_seconds INTEGER,
  sms_sent INTEGER,
  sms_failed INTEGER,
  contacts_reached INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'responder')
    OR public.has_role(auth.uid(), 'org_admin')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.user_id,
    i.status,
    i.created_at,
    i.activated_at,
    i.resolved_at,
    i.duress_at,
    i.battery_level,
    i.signal_strength,
    i.latitude,
    i.longitude,
    i.accuracy_meters,
    COALESCE(l.fixes, 0)::INTEGER,
    COALESCE(e.clips, 0)::INTEGER,
    COALESCE(e.seconds, 0)::INTEGER,
    COALESCE(n.sent, 0)::INTEGER,
    COALESCE(n.failed, 0)::INTEGER,
    COALESCE(n.reached, 0)::INTEGER
  FROM public.incidents i
  LEFT JOIN LATERAL (
    SELECT count(*) AS fixes FROM public.location_updates lu WHERE lu.incident_id = i.id
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS clips, round(sum(COALESCE(ev.duration_ms, 0)) / 1000.0) AS seconds
    FROM public.incident_evidence ev WHERE ev.incident_id = i.id
  ) e ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE an.status = 'sent') AS sent,
      count(*) FILTER (WHERE an.status = 'failed') AS failed,
      -- A contact deleted since keeps a row with contact_id NULL; still count it once.
      count(DISTINCT COALESCE(an.contact_id::text, an.to_phone)) FILTER (WHERE an.status = 'sent') AS reached
    FROM public.alert_notifications an
    WHERE an.incident_id = i.id AND an.kind = 'alert'
  ) n ON true
  WHERE i.created_at >= p_since
    AND i.status <> 'pending'
  -- No row cap: a silent cut would shrink the previous period and inflate the change.
  ORDER BY i.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_incident_analytics(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_incident_analytics(TIMESTAMPTZ) TO authenticated;
