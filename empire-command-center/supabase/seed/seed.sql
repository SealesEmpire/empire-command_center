-- =====================================================================
-- Optional seed: Pre-creates the three Seale's Empire projects
-- ---------------------------------------------------------------------
-- Run this AFTER you've signed up and an org has been auto-created.
-- Replace <YOUR_ORG_ID> with the org_id from your profile.
--
-- Or use the SQL editor in Supabase Studio to run this against your row.
-- =====================================================================

-- Find your org id first:
-- select id, name from organizations;

-- Then run this with the right org_id:
do $$
declare
    v_org_id uuid;
begin
    -- Get the first org owned by the first user (for local dev seeding only)
    select o.id into v_org_id
    from organizations o
    join org_members om on om.org_id = o.id and om.role = 'owner'
    limit 1;

    if v_org_id is null then
        raise notice 'No org found yet. Sign up first, then re-run this seed.';
        return;
    end if;

    -- FDDY / Your Assistance
    insert into projects (org_id, name, slug, description, phase, health, color, icon,
                          next_milestone, percent_complete, summary)
    values (
        v_org_id,
        'FDDY / Your Assistance',
        'fddy',
        'AI-diagnosed home repair platform with escrow marketplace and Home Intelligence Graph',
        'pre_launch',
        'on_track',
        '#00D8FF',
        '🏠',
        'App Store submission',
        75,
        'V1 backend deployed to Supabase. Schema, RLS, edge functions complete. Mobile app icon integrated. Awaiting App Store submission.'
    )
    on conflict (org_id, slug) do nothing;

    -- B2C Hub Wallet
    insert into projects (org_id, name, slug, description, phase, health, color, icon,
                          next_milestone, percent_complete, summary)
    values (
        v_org_id,
        'B2C Hub Wallet',
        'hub-wallet',
        'Financial layer: lending pool, automated interest, profit distribution, KYC',
        'in_development',
        'needs_attention',
        '#9D4EDD',
        '💳',
        'Securities compliance path decision (Reg CF vs Reg D)',
        45,
        'Working app shipped (auth, basic UI). Webhook architecture matches Empire Ingress pattern. Securities compliance review in progress with legal team.'
    )
    on conflict (org_id, slug) do nothing;

    -- The Nexus
    insert into projects (org_id, name, slug, description, phase, health, color, icon,
                          next_milestone, percent_complete, summary)
    values (
        v_org_id,
        'The Nexus',
        'nexus',
        'Multi-sided commerce hub: customers, stores, investors, suppliers, apprentices',
        'design',
        'needs_attention',
        '#FF2D87',
        '🌐',
        'Resolve Path 1/Path 2 25% interest split ambiguity',
        25,
        'Full ecosystem spec complete. Pool flow documented across 4 paths. Trust Tier system designed. 200-store seeding strategy in planning. Open questions on default risk and operating budget.'
    )
    on conflict (org_id, slug) do nothing;

    raise notice 'Seeded 3 projects for org %', v_org_id;
end$$;
