-- =====================================================================
-- Storage Buckets
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('ecc-uploads', 'ecc-uploads', false, 52428800,    -- 50 MB
     array['image/jpeg','image/png','image/webp','image/heic',
           'application/pdf',
           'text/plain','text/markdown','text/csv',
           'application/json',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
           'application/vnd.openxmlformats-officedocument.presentationml.presentation']),
    ('ecc-avatars', 'ecc-avatars', true, 2097152,
     array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Storage policies — files organized as `<org_id>/<project_slug>/<filename>`
-- ---------------------------------------------------------------------

create policy "ecc-uploads: members read own org files"
    on storage.objects for select
    using (
        bucket_id = 'ecc-uploads'
        and (storage.foldername(name))[1]::uuid in (select public.user_org_ids())
    );

create policy "ecc-uploads: contributors upload to own org"
    on storage.objects for insert
    with check (
        bucket_id = 'ecc-uploads'
        and public.can_write_org((storage.foldername(name))[1]::uuid)
    );

create policy "ecc-uploads: contributors delete own org files"
    on storage.objects for delete
    using (
        bucket_id = 'ecc-uploads'
        and public.can_write_org((storage.foldername(name))[1]::uuid)
    );

create policy "ecc-avatars: public read"
    on storage.objects for select
    using (bucket_id = 'ecc-avatars');

create policy "ecc-avatars: user uploads own"
    on storage.objects for insert
    with check (
        bucket_id = 'ecc-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
