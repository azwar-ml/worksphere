-- WorkSphere AI - Database Schema DDL
-- Paste this script into your Supabase SQL Editor and run it.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT DEFAULT 'employee' CHECK (role IN ('employee', 'admin', 'superadmin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by authenticated users" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id);

-- Trigger to sync auth.users to public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    check_in TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    check_out TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    check_in_image TEXT,
    check_out_image TEXT
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Attendance Policies
CREATE POLICY "Employees can view their own attendance" 
ON public.attendance FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "Employees can check-in/check-out" 
ON public.attendance FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Employees can update their own attendance (for check-out)" 
ON public.attendance FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));

-- 3. Workspaces Table
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Workspace Members Table
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(workspace_id, user_id)
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace Policies
CREATE POLICY "Authenticated users can view workspaces they belong to" 
ON public.workspaces FOR SELECT 
TO authenticated 
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
    OR id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can manage workspaces" 
ON public.workspaces FOR ALL 
TO authenticated 
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Workspace Members Policies
CREATE POLICY "Members can view workspace listings" 
ON public.workspace_members FOR SELECT 
TO authenticated 
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
    OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can manage workspace memberships" 
ON public.workspace_members FOR ALL 
TO authenticated 
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));

-- 5. Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Tasks Policies
CREATE POLICY "Users can view tasks assigned to them or their workspace" 
ON public.tasks FOR SELECT 
TO authenticated 
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
    OR assigned_to = auth.uid()
    OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can manage all tasks" 
ON public.tasks FOR ALL 
TO authenticated 
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "Employees can update status of tasks assigned to them" 
ON public.tasks FOR UPDATE 
TO authenticated 
USING (assigned_to = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'))
WITH CHECK (assigned_to = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));

-- 6. Work Uploads (Research Reports) Table
CREATE TABLE IF NOT EXISTS public.work_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_text TEXT NOT NULL,
    summary TEXT,
    blockers JSONB DEFAULT '[]'::jsonb,
    metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.work_uploads ENABLE ROW LEVEL SECURITY;

-- Work Uploads Policies
CREATE POLICY "Users can view their own work reports" 
ON public.work_uploads FOR SELECT 
TO authenticated 
USING (
    user_id = auth.uid() 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
);

CREATE POLICY "Employees can submit work reports" 
ON public.work_uploads FOR INSERT 
TO authenticated 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view and edit reports" 
ON public.work_uploads FOR ALL 
TO authenticated 
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));

-- 7. Messages (Workspace Chat) Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Messages Policies
CREATE POLICY "Users can view messages in their workspaces" 
ON public.messages FOR SELECT 
TO authenticated 
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
    OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can post messages in their workspaces" 
ON public.messages FOR INSERT 
TO authenticated 
WITH CHECK (
    user_id = auth.uid()
    AND (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
        OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    )
);

-- 8. Alerts Table
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('global', 'workspace', 'user')),
    target_id UUID, -- References public.workspaces(id) or public.profiles(id) depending on target_type
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Alerts Policies
CREATE POLICY "Users can view global, personal, or workspace alerts" 
ON public.alerts FOR SELECT 
TO authenticated 
USING (
    target_type = 'global'
    OR (target_type = 'user' AND target_id = auth.uid())
    OR (target_type = 'workspace' AND target_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
);

CREATE POLICY "Admins can manage alerts" 
ON public.alerts FOR ALL 
TO authenticated 
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));
