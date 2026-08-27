-- WorkSphere AI: Direct Messages Migration Script
-- Run this in your Supabase SQL Editor to support direct messaging.

-- 1. Alter workspace_id to drop NOT NULL constraint (DMs don't have workspaces)
ALTER TABLE public.messages ALTER COLUMN workspace_id DROP NOT NULL;

-- 2. Add receiver_id column referencing public.profiles(id)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. Rename user_id column to sender_id for clarity
ALTER TABLE public.messages RENAME COLUMN user_id TO sender_id;

-- 4. Re-enable Row Level Security on public.messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 5. Drop old workspace messages policies if they exist
DROP POLICY IF EXISTS "Users can view messages in their workspaces" ON public.messages;
DROP POLICY IF EXISTS "Users can post messages in their workspaces" ON public.messages;
DROP POLICY IF EXISTS "Users can view workspace messages or direct messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert workspace messages or direct messages" ON public.messages;

-- 6. Create SELECT Policy allowing workspace members or DM participants
CREATE POLICY "Users can read own messages"
ON public.messages FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 7. Create INSERT Policy allowing workspace members or DM participants to post
CREATE POLICY "Users can insert workspace messages or direct messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
    -- Sender must be the current user
    auth.uid() = sender_id
    AND (
        -- DMs: receiver must be specified
        receiver_id IS NOT NULL
        -- Workspace Messages: user must belong to workspace or be admin/superadmin
        OR (workspace_id IS NOT NULL AND (
            (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
            OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
        ))
    )
);
