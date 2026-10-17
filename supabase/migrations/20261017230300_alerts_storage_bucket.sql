-- Prepared only: creates a PRIVATE bucket when this migration is explicitly approved/applied.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('alert-media','alert-media',false,62914560,array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg'])
on conflict(id) do nothing;
-- No browser INSERT/UPDATE/DELETE policy. Upload and removal are admin server operations.
-- OBS receives short-lived signed READ URLs for only the currently claimed event.
create policy alert_media_owner_admin_read on storage.objects for select to authenticated
using(bucket_id='alert-media' and (storage.foldername(name))[1]=auth.uid()::text and public.is_admin(auth.uid()));
