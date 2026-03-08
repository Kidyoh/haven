
-- Create storage bucket for SOS audio evidence
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', true);

-- Allow authenticated users to upload to evidence bucket
CREATE POLICY "Users can upload evidence"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to read their own evidence
CREATE POLICY "Users can read own evidence"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow anon to read evidence (for share links)
CREATE POLICY "Anon can read evidence"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'evidence');

-- Allow responders to read all evidence
CREATE POLICY "Responders can read all evidence"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'evidence' AND (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'org_admin') OR public.has_role(auth.uid(), 'admin')));
