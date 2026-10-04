-- Kick clips are raw MPEG-TS. Storage rejected video/mp2t (HTTP 400) because
-- the clips bucket only allowed mp4/webm and images.

UPDATE storage.buckets
SET allowed_mime_types = CASE
  WHEN allowed_mime_types IS NULL THEN ARRAY[
    'video/mp4',
    'video/webm',
    'video/mp2t',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
  WHEN NOT ('video/mp2t' = ANY (allowed_mime_types)) THEN array_append(allowed_mime_types, 'video/mp2t')
  ELSE allowed_mime_types
END
WHERE id = 'clips';
