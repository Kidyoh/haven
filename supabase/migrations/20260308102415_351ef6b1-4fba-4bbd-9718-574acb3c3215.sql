
-- Organizations table for police stations, NGOs, etc.
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'police', -- police, ngo, hospital
  location text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- User roles (admin, responder, org_admin)
CREATE TYPE public.app_role AS ENUM ('admin', 'responder', 'org_admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS for organizations
CREATE POLICY "Authenticated users can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage organizations"
  ON public.organizations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Incident share tokens for Next of Kin public links
CREATE TABLE public.incident_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label text NOT NULL DEFAULT 'Next of Kin',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incident_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own shares"
  ON public.incident_shares FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public read for shares via token (anon role)
CREATE POLICY "Anyone can read active shares by token"
  ON public.incident_shares FOR SELECT
  TO anon
  USING (is_active = true);

-- Allow anon to read incidents linked via share tokens
CREATE POLICY "Anon can view incidents via share token"
  ON public.incidents FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.incident_shares
      WHERE incident_shares.user_id = incidents.user_id
        AND incident_shares.is_active = true
    )
  );

-- Allow anon to read location_updates via share tokens
CREATE POLICY "Anon can view locations via share token"
  ON public.location_updates FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.incident_shares
      WHERE incident_shares.user_id = location_updates.user_id
        AND incident_shares.is_active = true
    )
  );

-- Allow responders/org_admins to view all incidents
CREATE POLICY "Responders can view all incidents"
  ON public.incidents FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'org_admin') OR public.has_role(auth.uid(), 'admin'));

-- Allow responders to update incidents (change status, resolve)
CREATE POLICY "Responders can update incidents"
  ON public.incidents FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'org_admin') OR public.has_role(auth.uid(), 'admin'));

-- Allow responders to view location updates
CREATE POLICY "Responders can view all location updates"
  ON public.location_updates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'org_admin') OR public.has_role(auth.uid(), 'admin'));

-- Allow responders to view profiles for incident context
CREATE POLICY "Responders can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'org_admin') OR public.has_role(auth.uid(), 'admin'));

-- Enable realtime for incidents
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
