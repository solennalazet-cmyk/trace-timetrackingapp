create policy "Users upload own feedback screenshots"
on storage.objects for insert to authenticated
with check (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read own feedback screenshots"
on storage.objects for select to authenticated
using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Admins read feedback screenshots"
on storage.objects for select to authenticated
using (bucket_id = 'feedback-screenshots' and public.has_role(auth.uid(), 'admin'));