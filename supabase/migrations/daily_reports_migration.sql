-- WorkSphere AI: Daily Progress Reports Migration
-- Run this script in your Supabase SQL Editor.

-- 1. Create daily_reports table
CREATE TABLE IF NOT EXISTS public.daily_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_text TEXT NOT NULL,
    timeline_data JSONB DEFAULT '[]'::jsonb,
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- 3. Create SELECT Policy (Users can read their own daily reports, admins/superadmins can read all)
DROP POLICY IF EXISTS "Users can view their own daily reports" ON public.daily_reports;
CREATE POLICY "Users can view their own daily reports"
ON public.daily_reports FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
);

-- 4. Create INSERT Policy (Employees can insert their own daily reports)
DROP POLICY IF EXISTS "Employees can insert their own daily reports" ON public.daily_reports;
CREATE POLICY "Employees can insert their own daily reports"
ON public.daily_reports FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
);

-- 5. Create DELETE Policy (Employees can delete their own daily reports, admins/superadmins can delete any)
DROP POLICY IF EXISTS "Users can delete their own daily reports" ON public.daily_reports;
CREATE POLICY "Users can delete their own daily reports"
ON public.daily_reports FOR DELETE
TO authenticated
USING (
    user_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
);

-- 6. Setup Supabase Storage Bucket 'work-uploads'
INSERT INTO storage.buckets (id, name, public)
VALUES ('work-uploads', 'work-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage bucket policies for 'work-uploads'
DROP POLICY IF EXISTS "Authenticated users can upload work-uploads" ON storage.objects;
CREATE POLICY "Authenticated users can upload work-uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'work-uploads');

DROP POLICY IF EXISTS "Authenticated users can select work-uploads" ON storage.objects;
CREATE POLICY "Authenticated users can select work-uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'work-uploads');

DROP POLICY IF EXISTS "Authenticated users can delete work-uploads" ON storage.objects;
CREATE POLICY "Authenticated users can delete work-uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'work-uploads');
