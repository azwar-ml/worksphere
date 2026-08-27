-- WorkSphere AI - Supabase RLS Fix Script
-- Paste this script into your Supabase SQL Editor and execute it to fix infinite recursion in workspace_members.

-- 1. Drop problematic recursive policies
DROP POLICY IF EXISTS "Members can view workspace listings" ON public.workspace_members;
DROP POLICY IF EXISTS "Authenticated users can view workspaces they belong to" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view tasks assigned to them or their workspace" ON public.tasks;
DROP POLICY IF EXISTS "Users can view messages in their workspaces" ON public.messages;
DROP POLICY IF EXISTS "Users can post messages in their workspaces" ON public.messages;
DROP POLICY IF EXISTS "Users can view global, personal, or workspace alerts" ON public.alerts;

-- 2. Create simplified, non-recursive policies
-- Workspace Members: Allow all authenticated users to view membership mapping to eliminate subquery recursion
CREATE POLICY "Members can view workspace listings" 
ON public.workspace_members FOR SELECT 
TO authenticated 
USING (true);

-- Workspaces: Viewable if user is admin or is a member of the workspace (queries workspace_members, which has USING (true) so no recursion occurs)
CREATE POLICY "Authenticated users can view workspaces they belong to" 
ON public.workspaces FOR SELECT 
TO authenticated 
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
    OR id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

-- Tasks: Viewable if user is admin, is the assignee, or is member of the workspace
CREATE POLICY "Users can view tasks assigned to them or their workspace" 
ON public.tasks FOR SELECT 
TO authenticated 
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
    OR assigned_to = auth.uid()
    OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

-- Messages: Viewable if user is admin or workspace member
CREATE POLICY "Users can view messages in their workspaces" 
ON public.messages FOR SELECT 
TO authenticated 
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
    OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

-- Messages: Insert allowed if poster is admin or workspace member
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

-- Alerts: Viewable if global alert, targeted directly to the user, or targeted to the user's workspace
CREATE POLICY "Users can view global, personal, or workspace alerts" 
ON public.alerts FOR SELECT 
TO authenticated 
USING (
    target_type = 'global'
    OR (target_type = 'user' AND target_id = auth.uid())
    OR (target_type = 'workspace' AND target_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
);

-- Note: supabase.py backend queries usesettings.SUPABASE_SERVICE_ROLE_KEY which bypasses RLS completely.
