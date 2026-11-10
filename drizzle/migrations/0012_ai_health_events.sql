CREATE TABLE public.ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL,
  kind text NOT NULL,
  code text,
  http_status int,
  model text,
  retry_after int
);
GRANT ALL ON public.ai_events TO service_role;
REVOKE ALL ON public.ai_events FROM anon, authenticated;
ALTER TABLE public.ai_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX ai_events_created_idx ON public.ai_events (created_at DESC);
COMMENT ON TABLE public.ai_events IS 'Server-only health log of writing-helper results (no message text). Read by the admin diagnostic via the server.';