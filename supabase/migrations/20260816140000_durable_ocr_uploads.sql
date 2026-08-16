-- Two-step private GCS upload state for durable OCR queueing.

ALTER TABLE public.source_documents
  ADD COLUMN IF NOT EXISTS upload_state text NOT NULL DEFAULT 'pending';
ALTER TABLE public.source_documents
  ADD COLUMN IF NOT EXISTS verified_checksum_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.source_documents ADD CONSTRAINT source_documents_upload_state_check
    CHECK (upload_state IN ('pending', 'verified', 'rejected', 'purged'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
