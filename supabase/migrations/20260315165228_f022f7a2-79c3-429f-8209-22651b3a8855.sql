alter table webhook_logs enable row level security;

-- Only allow service role (edge functions) to access webhook_logs
-- No user-facing policy needed since this is internal