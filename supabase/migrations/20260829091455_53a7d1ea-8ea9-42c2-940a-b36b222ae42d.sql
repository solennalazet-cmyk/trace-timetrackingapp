UPDATE public.time_entries te
SET rate_amount = c.default_rate,
    rate_unit = COALESCE(te.rate_unit, 'hour'),
    rate_currency = COALESCE(te.rate_currency, c.currency, 'EUR'),
    billable_value = ROUND((te.duration_minutes::numeric / 60) * c.default_rate, 2)
FROM public.clients c
WHERE te.client_id = c.id
  AND te.deleted_at IS NULL
  AND te.billable IS TRUE
  AND te.rate_amount IS NULL
  AND c.default_rate IS NOT NULL
  AND (te.rate_unit IS NULL OR te.rate_unit = 'hour');