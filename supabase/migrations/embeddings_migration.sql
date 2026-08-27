-- WorkSphere AI - pgvector Embeddings Schema Migration
-- Paste this script into your Supabase SQL Editor and execute it.

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create Dossier Embeddings table
CREATE TABLE IF NOT EXISTS public.dossier_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    embedding vector(1024), -- Cohere V3 embedding dimension is 1024
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on dossier_embeddings
ALTER TABLE public.dossier_embeddings ENABLE ROW LEVEL SECURITY;

-- Dossier Embeddings RLS Policies
-- Allow admins and superadmins to perform all operations
CREATE POLICY "Admins and superadmins can manage all dossier embeddings" 
ON public.dossier_embeddings 
FOR ALL 
TO authenticated
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
)
WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
);

-- Index for HNSW similarity searches
CREATE INDEX IF NOT EXISTS dossier_embeddings_hnsw_idx 
ON public.dossier_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Index on metadata JSONB for rapid filtered queries
CREATE INDEX IF NOT EXISTS dossier_embeddings_metadata_idx 
ON public.dossier_embeddings 
USING gin (metadata);

-- RPC Function for similarity matching
CREATE OR REPLACE FUNCTION public.match_dossier_embeddings (
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  filter_user_id text DEFAULT NULL,
  filter_lab_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.content,
    de.metadata,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM public.dossier_embeddings de
  WHERE 
    (1 - (de.embedding <=> query_embedding) > match_threshold)
    AND (filter_user_id IS NULL OR de.metadata->>'user_id' = filter_user_id)
    AND (filter_lab_id IS NULL OR de.metadata->>'lab_id' = filter_lab_id)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
