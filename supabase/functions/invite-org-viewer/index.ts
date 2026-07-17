import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Client con el JWT del usuario para validar permisos via RLS
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();

    if (!organization_id || !email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'organization_id and valid email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar permisos: admin o founder vinculado a esa org
    const { data: canInvite, error: canErr } = await userClient.rpc('can_invite_to_org', {
      _user_id: user.id,
      _organization_id: organization_id,
    });
    if (canErr || !canInvite) {
      return new Response(JSON.stringify({ error: 'Not allowed to invite to this organization' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service client para insertar invitación (RLS-safe pero usamos service para garantizar)
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

    // Insertar invitación (upsert manual: si ya existe pending, lo dejamos)
    const { data: existing } = await adminClient
      .from('organization_invitations')
      .select('id, status')
      .eq('organization_id', organization_id)
      .ilike('email', email)
      .eq('status', 'pending')
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await adminClient.from('organization_invitations').insert({
        organization_id,
        email,
        invited_by: user.id,
        status: 'pending',
      });
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Mandar magic link / invite por email
    const origin = req.headers.get('origin') ?? '';
    const redirectTo = origin ? `${origin}/portfolio` : undefined;

    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    // Si el usuario ya existe, inviteUserByEmail falla. En ese caso, mandamos magic link.
    if (inviteErr) {
      const { error: linkErr } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      });
      // Si tampoco se puede generar link, igual la invitación queda registrada
      // y al loguearse normal se procesará.
      if (linkErr) {
        console.error('Magic link error:', linkErr);
      }

      // Si el usuario ya existe en auth.users, procesar invitación inmediatamente
      const { data: existingUser } = await adminClient
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      if (existingUser) {
        await adminClient.rpc('accept_pending_invitations', {
          _user_id: existingUser.id,
          _email: email,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});