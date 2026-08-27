import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { labId, labName, labDesc, adminName, adminEmail, adminPassword } = body;

    if (!labId || !labName || !adminName || !adminEmail || !adminPassword) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Server credentials not configured" }, { status: 500 });
    }

    // Initialize Supabase with service_role key to bypass RLS and use Admin Auth API
    const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. Create the new lab record
    const { error: labError } = await supabaseServer
      .from('labs')
      .insert({
        id: labId,
        name: labName,
        description: labDesc || null
      });

    if (labError) {
      return NextResponse.json({ error: `Lab creation failed: ${labError.message}` }, { status: 400 });
    }

    // 2. Create the Admin auth user securely
    const { data: userData, error: userError } = await supabaseServer.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName
      }
    });

    if (userError) {
      // Cleanup created lab if user creation fails
      await supabaseServer.from('labs').delete().eq('id', labId);
      return NextResponse.json({ error: `Admin user creation failed: ${userError.message}` }, { status: 400 });
    }

    const adminUserId = userData.user?.id;
    if (!adminUserId) {
      return NextResponse.json({ error: "Failed to retrieve user ID" }, { status: 500 });
    }

    // 3. Create the Admin user profile
    const { error: profileError } = await supabaseServer
      .from('profiles')
      .insert({
        id: adminUserId,
        full_name: adminName,
        email: adminEmail,
        role: 'admin',
        lab_id: labId,
        status: 'approved'
      });

    if (profileError) {
      // Cleanup created user & lab if profile insertion fails
      await supabaseServer.auth.admin.deleteUser(adminUserId);
      await supabaseServer.from('labs').delete().eq('id', labId);
      return NextResponse.json({ error: `Profile creation failed: ${profileError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, labId, adminUserId });
  } catch (err: any) {
    console.error("Secure Lab/Admin creation failed:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
