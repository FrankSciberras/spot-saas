-- =============================================================================
-- DEMO / VIDEO SEED  —  account: test@t1est.com
-- =============================================================================
-- Fills the test account's fleet with realistic mock data and puts the fleet on
-- the PRO plan with NO trial, so the dashboard looks "live" for a demo video.
--
-- HOW TO RUN
--   1. The account test@t1est.com must already exist (sign up first if not).
--   2. Open Supabase  ->  SQL Editor  ->  New query.
--   3. Paste this whole file and click RUN.
--
-- SAFE TO RE-RUN: it wipes its own previous demo data first (drivers with
-- @rovora-demo.local emails and vehicles with DEMO-### plates), then rebuilds.
-- It never touches data that isn't part of this demo set.
-- =============================================================================

DO $$
DECLARE
  v_email        text := 'test@t1est.com';
  v_uid          uuid;
  v_org          uuid;
  v_userid       uuid;
  v_did          uuid;
  v_vid          uuid;
  v_settle       uuid;
  v_geo          uuid;

  -- 8 drivers
  v_driver_names text[] := ARRAY[
    'Mark Borg','Daniela Vella','Luca Camilleri','Sarah Mifsud',
    'Andrei Popescu','Maria Grech','Jurgen Schembri','Aisha Hassan'];

  -- 8 vehicles (parallel arrays)
  v_makes    text[] := ARRAY['Toyota','Tesla','Toyota','Kia','Mercedes','Hyundai','Peugeot','Volkswagen'];
  v_models   text[] := ARRAY['Corolla','Model 3','Prius','Niro','Vito','Ioniq','208','Passat'];
  v_years    int[]  := ARRAY[2021,2023,2020,2022,2019,2021,2022,2020];
  v_colors   text[] := ARRAY['White','Black','Silver','Blue','White','Grey','Red','Black'];
  v_mileage  int[]  := ARRAY[84210,31050,121400,56720,142890,77640,43120,99880];

  v_plat     text[]    := ARRAY['Bolt','Uber','eCabs'];
  v_platfee  numeric[] := ARRAY[20,25,15];

  v_base_lat double precision := 35.8989;  -- Valletta, Malta
  v_base_lng double precision := 14.5146;

  v_driver_ids  uuid[] := '{}';
  v_vehicle_ids uuid[] := '{}';

  i int; w int; p int;
  v_week_start date; v_week_end date;
  v_gross numeric; v_fee numeric; v_fifty numeric; v_net numeric; v_bal numeric;
  v_tg numeric; v_tn numeric; v_tb numeric;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1. Find the account
  -- ---------------------------------------------------------------------------
  SELECT id INTO v_uid FROM auth.users WHERE email = v_email;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No account found for %. Sign up with that email first, then re-run.', v_email;
  END IF;

  -- Make sure the profile row exists and is an admin.
  INSERT INTO public.users (id, email, role, full_name)
  VALUES (v_uid, v_email, 'admin', 'Demo Admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin';

  -- ---------------------------------------------------------------------------
  -- 2. Resolve (or create) the fleet/organization for this account
  -- ---------------------------------------------------------------------------
  SELECT organization_id INTO v_org
    FROM memberships WHERE user_id = v_uid AND role = 'admin'
    ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    SELECT organization_id INTO v_org FROM memberships WHERE user_id = v_uid LIMIT 1;
  END IF;
  IF v_org IS NULL THEN
    INSERT INTO organizations (name, slug, plan)
    VALUES ('Demo Fleet', 'demo-fleet-' || substr(v_uid::text, 1, 8), 'growth')
    RETURNING id INTO v_org;
    INSERT INTO memberships (organization_id, user_id, role)
    VALUES (v_org, v_uid, 'admin');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. Put the fleet on PRO (key 'growth') with NO trial, active subscription
  -- ---------------------------------------------------------------------------
  -- Core columns (always present once the trials migration has run).
  UPDATE organizations SET
    plan              = 'growth',          -- 'Pro' tier
    status            = 'active',
    trial_started_at  = NULL,
    trial_ends_at     = NULL,
    plan_activated_at = COALESCE(plan_activated_at, NOW())
  WHERE id = v_org;

  -- Optional Stripe billing columns (only if that migration has been applied).
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='organizations'
               AND column_name='subscription_status') THEN
    EXECUTE 'UPDATE organizations SET subscription_status=''active'', '
         || 'current_period_end = NOW() + INTERVAL ''30 days'' WHERE id=$1' USING v_org;
  END IF;

  -- Optional tracking speed-limit column.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='organizations'
               AND column_name='speed_limit_kmh') THEN
    EXECUTE 'UPDATE organizations SET speed_limit_kmh=110 WHERE id=$1' USING v_org;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. Wipe any previous demo data for this fleet (idempotent re-runs)
  -- ---------------------------------------------------------------------------
  -- Deleting the demo driver accounts cascades to their drivers row and all
  -- driver-scoped data (shifts, settlements, positions, locations, etc.).
  DELETE FROM auth.users WHERE email LIKE 'demo.driver%@rovora-demo.local';
  -- Deleting demo vehicles cascades to services, damages and assignments.
  DELETE FROM vehicles  WHERE organization_id = v_org AND registration_number LIKE 'DEMO-%';
  IF to_regclass('public.geofences') IS NOT NULL THEN
    DELETE FROM geofences WHERE organization_id = v_org AND name LIKE 'Demo:%';
  END IF;
  DELETE FROM reminders WHERE created_by = v_uid AND title LIKE 'DEMO:%';
  DELETE FROM notifications WHERE organization_id = v_org
    AND (title LIKE 'DEMO:%' OR title LIKE 'Speeding%' OR title LIKE 'Zone alert%');

  -- ---------------------------------------------------------------------------
  -- 5. Create drivers (each needs an auth user + profile + membership)
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_driver_names, 1) LOOP
    v_userid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_userid, 'authenticated', 'authenticated',
      'demo.driver' || i || '@rovora-demo.local', crypt('Demo123!', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider":"email","providers":["email"]}', '{}', false,
      '', '', '', ''
    );

    INSERT INTO public.users (id, email, role, full_name)
    VALUES (v_userid, 'demo.driver' || i || '@rovora-demo.local', 'driver', v_driver_names[i]);

    INSERT INTO memberships (organization_id, user_id, role)
    VALUES (v_org, v_userid, 'driver') ON CONFLICT DO NOTHING;

    INSERT INTO drivers (
      user_id, full_name, phone, status, organization_id,
      id_card_number, driving_license_number,
      id_card_expiry_date, driving_license_expiry_date, police_conduct_expiry_date
    ) VALUES (
      v_userid, v_driver_names[i],
      '+356 7900 ' || lpad((1000 + i)::text, 4, '0'),
      'active', v_org,
      'ID' || lpad((100000 + i * 137)::text, 6, '0'),
      'DL' || lpad((200000 + i * 211)::text, 6, '0'),
      (NOW() + ((i * 23) % 120 || ' days')::interval)::date,
      (NOW() + ((i * 41) % 300 || ' days')::interval)::date,
      (NOW() + ((i * 17) % 90  || ' days')::interval)::date
    ) RETURNING id INTO v_did;

    v_driver_ids := array_append(v_driver_ids, v_did);
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 6. Create vehicles
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_makes, 1) LOOP
    INSERT INTO vehicles (
      registration_number, make, model, year, mileage, status, color,
      organization_id, insurance_expiry_date, road_license_expiry_date
    ) VALUES (
      'DEMO-' || lpad(i::text, 3, '0'), v_makes[i], v_models[i], v_years[i], v_mileage[i],
      CASE WHEN i = 5 THEN 'in_service'::vehicle_status ELSE 'active'::vehicle_status END,
      v_colors[i], v_org,
      (NOW() + ((i * 37) % 180 || ' days')::interval)::date,
      (NOW() + ((i * 53) % 200 || ' days')::interval)::date
    ) RETURNING id INTO v_vid;

    v_vehicle_ids := array_append(v_vehicle_ids, v_vid);
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 7. Assign driver[i] <-> vehicle[i]
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_driver_ids, 1) LOOP
    v_did := v_driver_ids[i];
    v_vid := v_vehicle_ids[i];
    UPDATE drivers  SET assigned_vehicle_id = v_vid WHERE id = v_did;
    UPDATE vehicles SET assigned_driver_id  = v_did WHERE id = v_vid;
    INSERT INTO driver_vehicle_assignments (driver_id, vehicle_id, organization_id)
    VALUES (v_did, v_vid, v_org) ON CONFLICT (driver_id, vehicle_id) DO NOTHING;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 8. Geofence zones (create BEFORE positions so zone alerts can fire)
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.geofences') IS NOT NULL THEN
    INSERT INTO geofences (organization_id, name, latitude, longitude, radius_m, notify_on, active) VALUES
      (v_org, 'Demo: Valletta Depot', 35.8989, 14.5146, 300, 'both',  true),
      (v_org, 'Demo: Malta Airport',  35.8575, 14.4775, 800, 'enter', true),
      (v_org, 'Demo: Sliema Hub',     35.9120, 14.5020, 250, 'both',  true);
    SELECT id INTO v_geo FROM geofences WHERE organization_id = v_org AND name = 'Demo: Valletta Depot' LIMIT 1;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 9. Shifts: 3 past per driver, plus an OPEN shift for the first 6 (live)
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_driver_ids, 1) LOOP
    v_did := v_driver_ids[i];
    v_vid := v_vehicle_ids[i];
    FOR w IN 1 .. 3 LOOP
      INSERT INTO driver_shifts (
        driver_id, vehicle_id, name, starting_mileage,
        start_time, end_time, dashcam_checked, car_internal_checked, organization_id
      ) VALUES (
        v_did, v_vid, v_driver_names[i] || ' — day shift', 50000 + (i * 1000) + (w * 180),
        NOW() - (w * INTERVAL '1 day') - INTERVAL '9 hours',
        NOW() - (w * INTERVAL '1 day') - INTERVAL '1 hour',
        true, true, v_org
      );
    END LOOP;
    IF i <= 6 THEN
      INSERT INTO driver_shifts (
        driver_id, vehicle_id, name, starting_mileage,
        start_time, end_time, dashcam_checked, car_internal_checked, organization_id
      ) VALUES (
        v_did, v_vid, v_driver_names[i] || ' — live shift', 51000 + (i * 1000),
        NOW() - INTERVAL '4 hours', NULL, true, true, v_org
      );
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 10. GPS history trail (route playback + distance) for first 4 drivers
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.driver_locations') IS NOT NULL THEN
    FOR i IN 1 .. 4 LOOP
      v_did := v_driver_ids[i];
      INSERT INTO driver_locations (organization_id, driver_id, latitude, longitude, speed, heading, accuracy, recorded_at)
      SELECT
        v_org, v_did,
        v_base_lat + (i * 0.010) + g * 0.0009 * sin(g / 3.0),
        v_base_lng + (i * 0.008) + g * 0.0011 * cos(g / 3.0),
        8 + (g % 15),
        (g * 15) % 360,
        5,
        NOW() - ((28 - g) * INTERVAL '2 minutes')
      FROM generate_series(0, 28) AS g;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 11. Live positions for first 6 drivers (driver #2 is speeding -> auto alert)
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.driver_positions') IS NOT NULL THEN
    FOR i IN 1 .. 6 LOOP
      v_did := v_driver_ids[i];
      INSERT INTO driver_positions (
        driver_id, organization_id, latitude, longitude, speed, heading, accuracy, is_tracking, recorded_at
      ) VALUES (
        v_did, v_org,
        v_base_lat + (i * 0.012), v_base_lng + (i * 0.010),
        CASE WHEN i = 2 THEN 34 ELSE 9 + (i * 2) END,   -- 34 m/s ≈ 122 km/h > 110 limit
        (i * 40) % 360, 5, true, NOW()
      )
      ON CONFLICT (driver_id) DO UPDATE SET
        latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
        speed = EXCLUDED.speed, is_tracking = true, recorded_at = NOW();
    END LOOP;
  END IF;

  -- A couple of explicit speeding events (in case the trigger dedup window hides one)
  IF to_regclass('public.speeding_events') IS NOT NULL THEN
    INSERT INTO speeding_events (organization_id, driver_id, speed_kmh, limit_kmh, latitude, longitude, occurred_at) VALUES
      (v_org, v_driver_ids[3], 128, 110, v_base_lat + 0.02, v_base_lng + 0.015, NOW() - INTERVAL '2 hours'),
      (v_org, v_driver_ids[5], 117, 110, v_base_lat + 0.03, v_base_lng + 0.02,  NOW() - INTERVAL '6 hours');
  END IF;

  -- A couple of geofence enter/exit events for the activity log
  IF to_regclass('public.geofence_events') IS NOT NULL AND v_geo IS NOT NULL THEN
    INSERT INTO geofence_events (organization_id, geofence_id, driver_id, event, latitude, longitude, occurred_at) VALUES
      (v_org, v_geo, v_driver_ids[1], 'enter', 35.8990, 14.5147, NOW() - INTERVAL '3 hours'),
      (v_org, v_geo, v_driver_ids[1], 'exit',  35.9050, 14.5200, NOW() - INTERVAL '2 hours');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 12. Weekly settlements (5 weeks per driver, 3 platforms each)
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_driver_ids, 1) LOOP
    v_did := v_driver_ids[i];
    FOR w IN 1 .. 5 LOOP
      v_week_start := (date_trunc('week', NOW())::date) - (w * 7);
      v_week_end   := v_week_start + 6;
      v_tg := 0; v_tn := 0; v_tb := 0;

      INSERT INTO driver_settlements (
        driver_id, week_start, week_end, week_label, period_name, fss_tax, status,
        organization_id, created_by,
        total_gross_fare, total_net, total_balance_before_tax, final_balance
      ) VALUES (
        v_did, v_week_start, v_week_end,
        to_char(v_week_start, 'DD Mon') || ' – ' || to_char(v_week_end, 'DD Mon'),
        'Week ' || to_char(v_week_start, 'IW'),
        22, CASE WHEN w = 1 THEN 'draft' ELSE 'finalized' END,
        v_org, v_uid, 0, 0, 0, 0
      ) RETURNING id INTO v_settle;

      FOR p IN 1 .. 3 LOOP
        v_gross := 250 + ((i * 37 + w * 53 + p * 29) % 350);
        v_fifty := round(v_gross * 0.5, 2);
        v_fee   := round(v_gross * (v_platfee[p] / 100.0), 2);
        v_net   := round(v_fifty - v_fee, 2);
        v_bal   := round(v_net + ((p * 7) % 20) + ((i * 3) % 15), 2);

        INSERT INTO settlement_platforms (
          settlement_id, organization_id, platform_id, platform_name,
          gross_fare, platform_fee_percent, fifty_percent, fee, net,
          cash_ride, tips, campaigns, balance
        ) VALUES (
          v_settle, v_org, lower(v_plat[p]), v_plat[p],
          v_gross, v_platfee[p], v_fifty, v_fee, v_net,
          (p * 5) % 30, (i + p) % 12, (w * 4) % 18, v_bal
        );

        v_tg := v_tg + v_gross; v_tn := v_tn + v_net; v_tb := v_tb + v_bal;
      END LOOP;

      UPDATE driver_settlements SET
        total_gross_fare = v_tg, total_net = v_tn,
        total_balance_before_tax = v_tb, final_balance = round(v_tb - 22, 2)
      WHERE id = v_settle;
    END LOOP;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 13. Vehicle services (one logged + one upcoming per vehicle)
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_vehicle_ids, 1) LOOP
    v_vid := v_vehicle_ids[i];
    INSERT INTO vehicle_services (
      vehicle_id, service_date, service_type, mileage_at_service,
      next_service_mileage, next_service_date, cost, service_provider, description,
      organization_id, created_by
    ) VALUES (
      v_vid, (NOW() - ((i * 15) || ' days')::interval)::date,
      (ARRAY['oil_change','brake_service','tire_replacement','annual_service',
             'general_inspection','battery','air_filter','major_service'])[i]::service_type,
      v_mileage[i] - 1500, v_mileage[i] + 8500,
      (NOW() + ((i * 20) || ' days')::interval)::date,
      80 + (i * 25), 'Demo Auto Garage', 'Routine scheduled maintenance',
      v_org, v_uid
    );
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 14. Vehicle damages
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. 4 LOOP
    v_vid := v_vehicle_ids[i];
    INSERT INTO vehicle_damages (
      vehicle_id, zone, description, severity, status, repair_cost,
      reported_by, reported_at, organization_id
    ) VALUES (
      v_vid,
      (ARRAY['front_bumper','rear_door_left','windscreen','wing_mirror_right'])[i],
      (ARRAY['Scratch from tight parking','Dent on rear door','Stone chip in glass','Cracked mirror housing'])[i],
      (ARRAY['minor','moderate','minor','minor'])[i]::damage_severity,
      (ARRAY['open','open','monitoring','repaired'])[i]::damage_status,
      (ARRAY[120,450,90,60])[i],
      v_uid, NOW() - ((i * 3) || ' days')::interval, v_org
    );
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 15. Reminders / to-dos (owned by the admin)
  -- ---------------------------------------------------------------------------
  INSERT INTO reminders (created_by, assigned_to, title, description, priority, status, due_date, organization_id) VALUES
    (v_uid, v_uid, 'DEMO: Renew fleet insurance',        'Annual policy renewal for 3 vehicles.', 'high',   'pending',     NOW() + INTERVAL '5 days',  v_org),
    (v_uid, v_uid, 'DEMO: Pay weekly driver settlements','Finalise and pay this week''s settlements.', 'urgent', 'in_progress', NOW() + INTERVAL '1 day',   v_org),
    (v_uid, v_uid, 'DEMO: Service DEMO-003 (Prius)',      'Due for oil change at next interval.',   'medium', 'pending',     NOW() + INTERVAL '9 days',  v_org),
    (v_uid, v_uid, 'DEMO: Collect police conduct docs',   'Two drivers expiring this month.',       'high',   'pending',     NOW() + INTERVAL '12 days', v_org),
    (v_uid, v_uid, 'DEMO: Order new dashcams',            'Replace faulty units in 2 cars.',        'low',    'pending',     NOW() + INTERVAL '20 days', v_org);

  -- ---------------------------------------------------------------------------
  -- 16. A few notifications for the bell / activity feed
  -- ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='notifications'
               AND column_name='target_role') THEN
    INSERT INTO notifications (organization_id, driver_id, title, body, type, target_role, action_url) VALUES
      (v_org, NULL, 'DEMO: Welcome to Rovora Pro', 'Your fleet is now on the Pro plan — all features unlocked.', 'info',    'admin', '/fleet'),
      (v_org, NULL, 'DEMO: Settlements ready',     'This week''s driver settlements are ready to review.',       'info',    'admin', '/fleet/settlements'),
      (v_org, NULL, 'DEMO: Document expiring',     'Sarah Mifsud''s police conduct expires soon.',               'warning', 'admin', '/fleet/drivers');
  ELSE
    INSERT INTO notifications (organization_id, driver_id, title, body, type, action_url) VALUES
      (v_org, NULL, 'DEMO: Welcome to Rovora Pro', 'Your fleet is now on the Pro plan — all features unlocked.', 'info',    '/fleet'),
      (v_org, NULL, 'DEMO: Settlements ready',     'This week''s driver settlements are ready to review.',       'info',    '/fleet/settlements'),
      (v_org, NULL, 'DEMO: Document expiring',     'Sarah Mifsud''s police conduct expires soon.',               'warning', '/fleet/drivers');
  END IF;

  RAISE NOTICE 'Demo seed complete for % (org %): % drivers, % vehicles.',
    v_email, v_org, array_length(v_driver_ids, 1), array_length(v_vehicle_ids, 1);
END $$;

-- =============================================================================
-- Quick verification (optional — shows what was created)
-- =============================================================================
SELECT o.name AS fleet, o.plan, o.status, o.trial_ends_at, o.plan_activated_at,
       (SELECT count(*) FROM drivers  d WHERE d.organization_id = o.id) AS drivers,
       (SELECT count(*) FROM vehicles v WHERE v.organization_id = o.id) AS vehicles,
       (SELECT count(*) FROM driver_settlements s WHERE s.organization_id = o.id) AS settlements
FROM organizations o
WHERE o.id IN (SELECT organization_id FROM memberships m
               JOIN auth.users u ON u.id = m.user_id
               WHERE u.email = 'test@t1est.com' AND m.role = 'admin');
