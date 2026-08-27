-- WorkSphere AI - Hierarchical Multi-Tenant Lab Management System Migration
-- Paste this script into your Supabase SQL Editor and execute it.

-- 1. Create Labs Table
CREATE TABLE IF NOT EXISTS public.labs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert the 4 specific labs
INSERT INTO public.labs (id, name) VALUES
    ('gen_ai', 'Generative AI Lab'),
    ('ai', 'Artificial Intelligence Lab'),
    ('web_dev', 'Web Development Lab'),
    ('cyber_sec', 'Cyber Security Lab')
ON CONFLICT (id) DO NOTHING;

-- 2. Update Profiles Table
-- Add lab_id column referencing labs
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lab_id TEXT REFERENCES public.labs(id) ON DELETE SET NULL;

-- Add status column (default 'pending', constraint: 'pending', 'approved', 'rejected')
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status') THEN
        ALTER TABLE public.profiles ADD COLUMN status TEXT DEFAULT 'pending';
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;

-- Update existing profiles that might have a role of 'pending' (role is now 'employee', status becomes 'pending')
UPDATE public.profiles SET status = 'pending', role = 'employee' WHERE role = 'pending';

-- Re-constraint Role Column to strictly: 'superadmin', 'admin', 'employee'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('superadmin', 'admin', 'employee'));
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'employee';

-- 3. Overwrite handle_new_user() Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, lab_id, status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        'employee', -- role set to employee strictly on sign up
        NEW.raw_user_meta_data->>'lab_id', -- extract lab_id from signup user metadata
        'pending' -- status strictly pending
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Update Alerts Table and RLS Policies for Hierarchical Alerts
-- Add target_lab column
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS target_lab TEXT REFERENCES public.labs(id) ON DELETE SET NULL;

-- Update target_type check constraint to include 'lab'
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_target_type_check;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_target_type_check CHECK (target_type IN ('global', 'workspace', 'user', 'lab'));

-- Drop and recreate the SELECT policy on alerts to permit reading lab-scoped alerts
DROP POLICY IF EXISTS "Users can view global, personal, or workspace alerts" ON public.alerts;
CREATE POLICY "Users can view global, personal, or workspace alerts" 
ON public.alerts FOR SELECT 
TO authenticated 
USING (
    target_type = 'global'
    OR (target_type = 'user' AND target_id = auth.uid())
    OR (target_type = 'workspace' AND target_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
    OR (target_type = 'lab' AND target_lab = (SELECT lab_id FROM public.profiles WHERE id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
);
