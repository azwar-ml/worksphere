-- WorkSphere AI - Supabase Seed and Role Constraint SQL
-- Paste this script into your Supabase SQL Editor and execute it.

-- 1. Alter profiles table role check constraint to allow 'pending'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('pending', 'employee', 'admin', 'superadmin'));
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'pending';

-- 2. Update new user trigger function to default role to 'pending'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        'pending' -- All new registrations default to pending approval
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Seed 6 Default Users (Assuming their Auth accounts are created)
-- We insert into auth.users (if not exists) and then ensure their profile role is set correctly.
-- All users will have the password 'password123' hashed using standard blowfish bcrypt.

-- 3.1. Superadmin (NCAI Director)
INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data, aud, role, 
    created_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'superadmin@ncai.gov',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "NCAI Director", "role": "superadmin"}'::jsonb,
    'authenticated',
    'authenticated',
    now(),
    now()
) ON CONFLICT (email) DO NOTHING;

-- 3.2. Admins
INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data, aud, role, 
    created_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'admin1@ncai.gov',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Admin One", "role": "admin"}'::jsonb,
    'authenticated',
    'authenticated',
    now(),
    now()
) ON CONFLICT (email) DO NOTHING;

INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data, aud, role, 
    created_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'admin2@ncai.gov',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Admin Two", "role": "admin"}'::jsonb,
    'authenticated',
    'authenticated',
    now(),
    now()
) ON CONFLICT (email) DO NOTHING;

-- 3.3. Employees / Researchers
INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data, aud, role, 
    created_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000004',
    'employee1@ncai.gov',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Employee One", "role": "employee"}'::jsonb,
    'authenticated',
    'authenticated',
    now(),
    now()
) ON CONFLICT (email) DO NOTHING;

INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data, aud, role, 
    created_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000005',
    'employee2@ncai.gov',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Employee Two", "role": "employee"}'::jsonb,
    'authenticated',
    'authenticated',
    now(),
    now()
) ON CONFLICT (email) DO NOTHING;

INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data, aud, role, 
    created_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000006',
    'employee3@ncai.gov',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Employee Three", "role": "employee"}'::jsonb,
    'authenticated',
    'authenticated',
    now(),
    now()
) ON CONFLICT (email) DO NOTHING;

-- 4. Update the profiles table to override the trigger-default 'pending' role for these seeded users
UPDATE public.profiles SET role = 'superadmin' WHERE email = 'superadmin@ncai.gov';
UPDATE public.profiles SET role = 'admin' WHERE email IN ('admin1@ncai.gov', 'admin2@ncai.gov');
UPDATE public.profiles SET role = 'employee' WHERE email IN ('employee1@ncai.gov', 'employee2@ncai.gov', 'employee3@ncai.gov');
