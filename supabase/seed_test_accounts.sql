-- =============================================================================
-- TEST ACCOUNTS SEED  —  one FLEET login + one DRIVER login, with demo data
-- =============================================================================
-- Creates a self-contained test fleet ("Rovora Test Fleet") on the Pro plan
-- (no trial) and two ready-to-use logins:
--
--   FLEET (admin)  fleet.test@rovora-demo.local   / RovoraTest!2026  -> /fleet
--   DRIVER         driver.test@rovora-demo.local  / RovoraTest!2026  -> /driver
--
-- plus 5 extra demo drivers (test.driver2..6@rovora-demo.local, same password),
-- 6 vehicles, shift history, live GPS positions, weekly settlements, published
-- rosters, adjustments, services, damages, geofences, reminders and
-- notifications — so both the fleet dashboard and the driver portal look live.
--
-- The driver test account is deliberately NOT on shift, so you can try
-- "Go online" -> "End shift" yourself. Three of the other drivers are live.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query -> paste this whole file -> RUN.
--   No sign-up needed first: the script creates the auth users itself.
--   (Change v_password below first if you want a different password.)
--
-- SAFE TO RE-RUN: it deletes its own previous test fleet (slug
-- 'rovora-test-fleet') and its own test users, then rebuilds everything.
-- It refuses to delete that fleet if anyone else is a member of it, and it
-- never touches seed_demo.sql's demo fleet or any other fleet.
-- =============================================================================

DO $$
DECLARE
  v_password     text := 'RovoraTest!2026';
  v_fleet_email  text := 'fleet.test@rovora-demo.local';
  v_driver_email text := 'driver.test@rovora-demo.local';
  v_fleet_name   text := 'Rovora Test Fleet';
  v_slug         text := 'rovora-test-fleet';

  v_admin_uid  uuid;
  v_org        uuid;
  v_uid        uuid;
  v_email      text;
  v_did        uuid;
  v_vid        uuid;
  v_settle     uuid;
  v_geo        uuid;
  v_roster     uuid;
  v_shift      uuid;

  -- Driver #1 is the DRIVER TEST ACCOUNT; #2-#6 are extra demo drivers.
  v_driver_names text[] := ARRAY[
    'Test Driver','Mark Borg','Daniela Vella','Luca Camilleri','Sarah Mifsud','Andrei Popescu'];

  -- 6 vehicles (parallel arrays)
  v_makes    text[] := ARRAY['Toyota','Tesla','Kia','Hyundai','Mercedes','Toyota'];
  v_models   text[] := ARRAY['Corolla','Model 3','Niro','Ioniq','Vito','Prius'];
  v_years    int[]  := ARRAY[2022,2023,2022,2021,2019,2020];
  v_colors   text[] := ARRAY['White','Black','Blue','Grey','White','Silver'];
  v_mileage  int[]  := ARRAY[48210,31050,56720,77640,142890,121400];

  v_plat     text[]    := ARRAY['bolt','uber','ecabs'];
  v_platname text[]    := ARRAY['Bolt','Uber','Ecabs'];
  v_platfee  numeric[] := ARRAY[20,25,15];

  v_base_lat double precision := 35.8989;  -- Valletta, Malta
  v_base_lng double precision := 14.5146;

  v_driver_ids  uuid[] := '{}';
  v_vehicle_ids uuid[] := '{}';
  v_user_ids    uuid[] := '{}';

  i int; w int; p int; d int;
  v_week_start date; v_week_end date; v_this_monday date;
  v_gross numeric; v_fee numeric; v_fifty numeric; v_net numeric; v_bal numeric;
  v_tg numeric; v_tn numeric; v_tb numeric;
  v_start timestamptz; v_km int; v_odo int;
BEGIN
  v_this_monday := date_trunc('week', NOW())::date;

  -- ---------------------------------------------------------------------------
  -- 1. Wipe the previous run (only our own fleet + our own users)
  -- ---------------------------------------------------------------------------
  SELECT id INTO v_org FROM organizations WHERE slug = v_slug;
  IF v_org IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM memberships m JOIN auth.users u ON u.id = m.user_id
      WHERE m.organization_id = v_org
        AND u.email NOT IN (v_fleet_email, v_driver_email)
        AND u.email NOT LIKE 'test.driver%@rovora-demo.local'
    ) THEN
      RAISE EXCEPTION 'Fleet with slug % has members that this script did not create — refusing to delete it.', v_slug;
    END IF;
    -- Every fleet-scoped table cascades from organizations.
    DELETE FROM organizations WHERE id = v_org;
  END IF;
  -- Cascades to public.users, memberships and anything else user-scoped.
  DELETE FROM auth.users
   WHERE email IN (v_fleet_email, v_driver_email)
      OR email LIKE 'test.driver%@rovora-demo.local';

  -- ---------------------------------------------------------------------------
  -- 2. Auth users: fleet admin + 6 drivers (confirmed, password login)
  -- ---------------------------------------------------------------------------
  FOR i IN 0 .. array_length(v_driver_names, 1) LOOP
    v_email := CASE
      WHEN i = 0 THEN v_fleet_email
      WHEN i = 1 THEN v_driver_email
      ELSE 'test.driver' || i || '@rovora-demo.local'
    END;
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', CASE WHEN i = 0 THEN 'Test Fleet Admin' ELSE v_driver_names[i] END),
      false, '', '', '', ''
    );

    -- Email identity row (what Supabase itself creates on sign-up).
    IF to_regclass('auth.identities') IS NOT NULL THEN
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (v_uid::text, v_uid,
              jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
              'email', NOW(), NOW(), NOW());
    END IF;

    IF i = 0 THEN
      v_admin_uid := v_uid;
    ELSE
      v_user_ids := array_append(v_user_ids, v_uid);
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 3. Fleet on PRO (key 'growth'), no trial, active subscription
  -- ---------------------------------------------------------------------------
  INSERT INTO public.users (id, email, role, full_name)
  VALUES (v_admin_uid, v_fleet_email, 'admin', 'Test Fleet Admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = EXCLUDED.full_name;

  INSERT INTO organizations (name, slug, plan, status, trial_started_at, trial_ends_at, plan_activated_at)
  VALUES (v_fleet_name, v_slug, 'growth', 'active', NULL, NULL, NOW() - INTERVAL '60 days')
  RETURNING id INTO v_org;

  INSERT INTO memberships (organization_id, user_id, role)
  VALUES (v_org, v_admin_uid, 'admin');

  -- Optional columns, only if their migrations have been applied.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='organizations' AND column_name='subscription_status') THEN
    EXECUTE 'UPDATE organizations SET subscription_status=''active'', '
         || 'current_period_end = NOW() + INTERVAL ''30 days'' WHERE id=$1' USING v_org;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='organizations' AND column_name='speed_limit_kmh') THEN
    EXECUTE 'UPDATE organizations SET speed_limit_kmh=110 WHERE id=$1' USING v_org;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='organizations' AND column_name='legal_name') THEN
    EXECUTE 'UPDATE organizations SET legal_name=''Rovora Test Fleet Ltd'', '
         || 'contact_email=$2, contact_phone=''+356 2100 0000'', '
         || 'address=''1 Republic Street, Valletta, Malta'' WHERE id=$1'
      USING v_org, v_fleet_email;
  END IF;
  -- Skip the first-login product tour so the dashboard opens straight away.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='users' AND column_name='fleet_tour_completed_at') THEN
    EXECUTE 'UPDATE public.users SET fleet_tour_completed_at = NOW() WHERE id=$1' USING v_admin_uid;
  END IF;

  -- Same defaults a fleet gets when it signs up normally.
  IF to_regprocedure('public.seed_default_notification_rules(uuid)') IS NOT NULL THEN
    PERFORM public.seed_default_notification_rules(v_org);
  END IF;
  IF to_regprocedure('public.seed_default_platforms(uuid)') IS NOT NULL THEN
    PERFORM public.seed_default_platforms(v_org);
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. Drivers (profile + membership + drivers row)
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_driver_names, 1) LOOP
    v_uid := v_user_ids[i];
    v_email := CASE WHEN i = 1 THEN v_driver_email ELSE 'test.driver' || i || '@rovora-demo.local' END;

    INSERT INTO public.users (id, email, role, full_name)
    VALUES (v_uid, v_email, 'driver', v_driver_names[i])
    ON CONFLICT (id) DO UPDATE SET role = 'driver', full_name = EXCLUDED.full_name;

    INSERT INTO memberships (organization_id, user_id, role)
    VALUES (v_org, v_uid, 'driver');

    INSERT INTO drivers (
      user_id, full_name, phone, address, status, organization_id,
      id_card_number, driving_license_number,
      id_card_expiry_date, driving_license_expiry_date, police_conduct_expiry_date
    ) VALUES (
      v_uid, v_driver_names[i],
      '+356 7900 ' || lpad((2000 + i)::text, 4, '0'),
      (ARRAY['12 Triq il-Kbira, Birkirkara','4 Tower Road, Sliema','8 Triq San Pawl, Qormi',
             '21 Triq il-Wied, Msida','3 Triq Ħal Qormi, Marsa','17 Triq il-Mosta, Attard'])[i],
      'active', v_org,
      'ID' || lpad((300000 + i * 137)::text, 6, '0'),
      'DL' || lpad((400000 + i * 211)::text, 6, '0'),
      -- The test driver gets one document expiring in ~10 days so expiry
      -- warnings show on both sides; everything else is comfortably valid.
      (NOW() + (CASE WHEN i = 1 THEN 220 ELSE (i * 23) % 120 + 20 END || ' days')::interval)::date,
      (NOW() + (CASE WHEN i = 1 THEN 540 ELSE (i * 41) % 300 + 30 END || ' days')::interval)::date,
      (NOW() + (CASE WHEN i = 1 THEN 10  ELSE (i * 17) % 90  + 15 END || ' days')::interval)::date
    ) RETURNING id INTO v_did;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
               AND table_name='drivers' AND column_name='employment_type') THEN
      EXECUTE format('UPDATE drivers SET employment_type = %L WHERE id = $1',
                     CASE WHEN i IN (4, 6) THEN 'part_time' ELSE 'full_time' END) USING v_did;
    END IF;

    v_driver_ids := array_append(v_driver_ids, v_did);
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 5. Vehicles (TST-001 .. TST-006) + assignments driver[i] <-> vehicle[i]
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_makes, 1) LOOP
    INSERT INTO vehicles (
      registration_number, make, model, year, mileage, status, color,
      organization_id, insurance_expiry_date, road_license_expiry_date
    ) VALUES (
      'TST-' || lpad(i::text, 3, '0'), v_makes[i], v_models[i], v_years[i], v_mileage[i],
      CASE WHEN i = 5 THEN 'in_service'::vehicle_status ELSE 'active'::vehicle_status END,
      v_colors[i], v_org,
      (NOW() + ((i * 37) % 180 + 25 || ' days')::interval)::date,
      (NOW() + ((i * 53) % 200 + 30 || ' days')::interval)::date
    ) RETURNING id INTO v_vid;
    v_vehicle_ids := array_append(v_vehicle_ids, v_vid);
  END LOOP;

  FOR i IN 1 .. array_length(v_driver_ids, 1) LOOP
    UPDATE drivers  SET assigned_vehicle_id = v_vehicle_ids[i] WHERE id = v_driver_ids[i];
    UPDATE vehicles SET assigned_driver_id  = v_driver_ids[i]  WHERE id = v_vehicle_ids[i];
    INSERT INTO driver_vehicle_assignments (driver_id, vehicle_id, organization_id)
    VALUES (v_driver_ids[i], v_vehicle_ids[i], v_org) ON CONFLICT (driver_id, vehicle_id) DO NOTHING;
  END LOOP;
  -- The test driver may also take the spare Prius (TST-006), so "Go online"
  -- offers a choice of vehicle.
  INSERT INTO driver_vehicle_assignments (driver_id, vehicle_id, organization_id)
  VALUES (v_driver_ids[1], v_vehicle_ids[6], v_org) ON CONFLICT (driver_id, vehicle_id) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 6. Geofence zones (before positions, so zone triggers can fire)
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.geofences') IS NOT NULL THEN
    INSERT INTO geofences (organization_id, name, latitude, longitude, radius_m, notify_on, active) VALUES
      (v_org, 'Valletta Depot', 35.8989, 14.5146, 300, 'both',  true),
      (v_org, 'Malta Airport',  35.8575, 14.4775, 800, 'enter', true),
      (v_org, 'Sliema Hub',     35.9120, 14.5020, 250, 'both',  true);
    SELECT id INTO v_geo FROM geofences WHERE organization_id = v_org AND name = 'Valletta Depot';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 7. Shift history. Test driver: 12 finished shifts over the last 16 days,
  --    NOT on shift now. Others: 4 finished each; drivers 2-4 are live now.
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_driver_ids, 1) LOOP
    v_did := v_driver_ids[i];
    v_vid := v_vehicle_ids[i];
    v_odo := v_mileage[i] - 2600;
    FOR w IN 1 .. CASE WHEN i = 1 THEN 16 ELSE 4 END LOOP
      CONTINUE WHEN i = 1 AND w IN (4, 8, 11, 15);   -- days off
      v_start := date_trunc('day', NOW()) - (w * INTERVAL '1 day')
                 + ((6 + (w + i) % 4) * INTERVAL '1 hour');
      v_km := 140 + ((w * 37 + i * 19) % 120);
      INSERT INTO driver_shifts (
        driver_id, vehicle_id, name, starting_mileage, ending_mileage,
        start_time, end_time, dashcam_checked, car_internal_checked, organization_id
      ) VALUES (
        v_did, v_vid, v_driver_names[i] || ' — ' || to_char(v_start, 'Dy DD Mon'),
        v_odo, v_odo + v_km,
        v_start, v_start + ((8 + (w % 3)) * INTERVAL '1 hour'),
        true, true, v_org
      );
      v_odo := v_odo + v_km;
    END LOOP;

    IF i BETWEEN 2 AND 4 THEN
      INSERT INTO driver_shifts (
        driver_id, vehicle_id, name, starting_mileage,
        start_time, end_time, dashcam_checked, car_internal_checked, organization_id
      ) VALUES (
        v_did, v_vid, v_driver_names[i] || ' — live shift', v_odo,
        NOW() - ((2 + i) * INTERVAL '1 hour'), NULL, true, true, v_org
      ) RETURNING id INTO v_shift;

      -- GPS trail for route playback (last ~1 hour)
      IF to_regclass('public.driver_locations') IS NOT NULL THEN
        INSERT INTO driver_locations (organization_id, driver_id, shift_id, latitude, longitude, speed, heading, accuracy, recorded_at)
        SELECT v_org, v_did, v_shift,
               v_base_lat + (i * 0.010) + g * 0.0009 * sin(g / 3.0),
               v_base_lng + (i * 0.008) + g * 0.0011 * cos(g / 3.0),
               8 + (g % 15), (g * 15) % 360, 5,
               NOW() - ((28 - g) * INTERVAL '2 minutes')
        FROM generate_series(0, 28) AS g;
      END IF;

      -- Live position (driver #3 is speeding: 34 m/s ≈ 122 km/h > 110 limit)
      IF to_regclass('public.driver_positions') IS NOT NULL THEN
        INSERT INTO driver_positions (driver_id, organization_id, shift_id, latitude, longitude, speed, heading, accuracy, is_tracking, recorded_at)
        VALUES (v_did, v_org, v_shift,
                v_base_lat + (i * 0.010) + 28 * 0.0009 * sin(28 / 3.0),
                v_base_lng + (i * 0.008) + 28 * 0.0011 * cos(28 / 3.0),
                CASE WHEN i = 3 THEN 34 ELSE 9 + i * 2 END, (i * 40) % 360, 5, true, NOW())
        ON CONFLICT (driver_id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id, shift_id = EXCLUDED.shift_id,
          latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, speed = EXCLUDED.speed,
          is_tracking = true, recorded_at = NOW();
      END IF;
    END IF;

    UPDATE vehicles SET mileage = GREATEST(mileage, v_odo) WHERE id = v_vid;
  END LOOP;

  IF to_regclass('public.speeding_events') IS NOT NULL THEN
    INSERT INTO speeding_events (organization_id, driver_id, speed_kmh, limit_kmh, latitude, longitude, occurred_at) VALUES
      (v_org, v_driver_ids[4], 128, 110, v_base_lat + 0.02, v_base_lng + 0.015, NOW() - INTERVAL '2 hours'),
      (v_org, v_driver_ids[5], 117, 110, v_base_lat + 0.03, v_base_lng + 0.02,  NOW() - INTERVAL '2 days');
  END IF;
  IF to_regclass('public.geofence_events') IS NOT NULL AND v_geo IS NOT NULL THEN
    INSERT INTO geofence_events (organization_id, geofence_id, driver_id, event, latitude, longitude, occurred_at) VALUES
      (v_org, v_geo, v_driver_ids[2], 'enter', 35.8990, 14.5147, NOW() - INTERVAL '3 hours'),
      (v_org, v_geo, v_driver_ids[2], 'exit',  35.9050, 14.5200, NOW() - INTERVAL '2 hours');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 8. Weekly settlements: 8 weeks per driver x 3 platforms.
  --    Last week = draft (for the fleet to finalise); older = finalized
  --    (what drivers see); weeks 4+ are also marked paid.
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_driver_ids, 1) LOOP
    v_did := v_driver_ids[i];
    FOR w IN 1 .. 8 LOOP
      v_week_start := v_this_monday - (w * 7);
      v_week_end   := v_week_start + 6;
      v_tg := 0; v_tn := 0; v_tb := 0;

      INSERT INTO driver_settlements (
        driver_id, week_start, week_end, week_label, period_name, fss_tax, status,
        settlement_month, paid_at, organization_id, created_by,
        total_gross_fare, total_net, total_balance_before_tax, final_balance
      ) VALUES (
        v_did, v_week_start, v_week_end,
        to_char(v_week_start, 'DD Mon') || ' – ' || to_char(v_week_end, 'DD Mon'),
        'Week ' || to_char(v_week_start, 'IW'),
        22, CASE WHEN w = 1 THEN 'draft' ELSE 'finalized' END,
        date_trunc('month', v_week_start)::date,
        CASE WHEN w >= 4 THEN (v_week_end + 3)::timestamptz END,
        v_org, v_admin_uid, 0, 0, 0, 0
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
          v_settle, v_org, v_plat[p], v_platname[p],
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

  -- Adjustments on the test driver (bonus, fuel reimbursement, deduction)
  INSERT INTO driver_adjustments (driver_id, type, amount, description, date, organization_id, created_by) VALUES
    (v_driver_ids[1], 'bonus',         50.00, 'Top-rated driver bonus',      v_this_monday - 5,  v_org, v_admin_uid),
    (v_driver_ids[1], 'reimbursement', 32.40, 'Fuel top-up receipt',         v_this_monday - 9,  v_org, v_admin_uid),
    (v_driver_ids[1], 'deduction',     15.00, 'Car wash (left car dirty)',   v_this_monday - 12, v_org, v_admin_uid),
    (v_driver_ids[2], 'expense',       20.00, 'Parking fine — Floriana',     v_this_monday - 3,  v_org, v_admin_uid);

  -- ---------------------------------------------------------------------------
  -- 9. Published rosters: this week + next week, Mon-Sat, driver[i] on vehicle[i]
  -- ---------------------------------------------------------------------------
  FOR w IN 0 .. 1 LOOP
    v_week_start := v_this_monday + (w * 7);
    INSERT INTO rosters (week_start, week_end, title, status, created_by, published_at, organization_id)
    VALUES (v_week_start, v_week_start + 6,
            'Week of ' || to_char(v_week_start, 'DD Mon'), 'published', v_admin_uid, NOW(), v_org)
    RETURNING id INTO v_roster;

    FOR i IN 1 .. array_length(v_driver_ids, 1) LOOP
      FOR d IN 0 .. 5 LOOP
        CONTINUE WHEN (i + d) % 7 = 6;   -- stagger a day off per driver
        INSERT INTO roster_assignments (roster_id, vehicle_id, driver_id, assignment_date, day_of_week, organization_id)
        VALUES (v_roster, v_vehicle_ids[i], v_driver_ids[i], v_week_start + d, d, v_org);
      END LOOP;
    END LOOP;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 10. Vehicle services (one done + one upcoming each) and damages
  -- ---------------------------------------------------------------------------
  FOR i IN 1 .. array_length(v_vehicle_ids, 1) LOOP
    INSERT INTO vehicle_services (
      vehicle_id, service_date, service_type, mileage_at_service,
      next_service_mileage, next_service_date, cost, service_provider, description,
      organization_id, created_by
    ) VALUES (
      v_vehicle_ids[i], (NOW() - ((i * 15) || ' days')::interval)::date,
      (ARRAY['oil_change','brake_service','tire_replacement','annual_service',
             'general_inspection','battery'])[i]::service_type,
      v_mileage[i] - 1500, v_mileage[i] + 8500,
      (NOW() + ((i * 20) || ' days')::interval)::date,
      80 + (i * 25), 'Test Auto Garage', 'Routine scheduled maintenance',
      v_org, v_admin_uid
    );
  END LOOP;

  FOR i IN 1 .. 4 LOOP
    INSERT INTO vehicle_damages (
      vehicle_id, zone, description, severity, status, repair_cost,
      reported_by, reported_at, organization_id
    ) VALUES (
      v_vehicle_ids[i],
      (ARRAY['front_bumper','rear_door_left','windscreen','wing_mirror_right'])[i],
      (ARRAY['Scratch from tight parking','Dent on rear door','Stone chip in glass','Cracked mirror housing'])[i],
      (ARRAY['minor','moderate','minor','minor'])[i]::damage_severity,
      (ARRAY['open','open','monitoring','repaired'])[i]::damage_status,
      (ARRAY[120,450,90,60])[i],
      v_admin_uid, NOW() - ((i * 3) || ' days')::interval, v_org
    );
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 11. Reminders (fleet admin's to-dos)
  -- ---------------------------------------------------------------------------
  INSERT INTO reminders (created_by, assigned_to, title, description, priority, status, due_date, organization_id) VALUES
    (v_admin_uid, v_admin_uid, 'Renew fleet insurance',         'Annual policy renewal for 3 vehicles.',     'high',   'pending',     NOW() + INTERVAL '5 days',  v_org),
    (v_admin_uid, v_admin_uid, 'Finalise last week''s settlements', 'Review and finalise the draft settlements.', 'urgent', 'in_progress', NOW() + INTERVAL '1 day',   v_org),
    (v_admin_uid, v_admin_uid, 'Service TST-006 (Prius)',       'Due for an oil change at next interval.',   'medium', 'pending',     NOW() + INTERVAL '9 days',  v_org),
    (v_admin_uid, v_admin_uid, 'Collect police conduct docs',   'Test Driver''s certificate expires soon.',  'high',   'pending',     NOW() + INTERVAL '8 days',  v_org);

  -- ---------------------------------------------------------------------------
  -- 12. Notifications: for the fleet, for the test driver, and a broadcast
  -- ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='notifications' AND column_name='target_role') THEN
    INSERT INTO notifications (organization_id, driver_id, title, body, type, target_role, action_url, created_at) VALUES
      (v_org, NULL, 'Settlements ready to review', 'Last week''s driver settlements are drafted and ready to finalise.', 'info', 'admin', '/fleet/settlements', NOW() - INTERVAL '3 hours'),
      (v_org, NULL, 'Document expiring', 'Test Driver''s police conduct certificate expires in 10 days.', 'warning', 'admin', '/fleet/drivers', NOW() - INTERVAL '1 day'),
      (v_org, v_driver_ids[1], 'Your settlement is ready', 'Your weekly settlement has been finalised — tap to view.', 'info', 'driver', '/driver/settlements', NOW() - INTERVAL '2 days'),
      (v_org, v_driver_ids[1], 'Police conduct expiring', 'Your police conduct certificate expires in 10 days. Please upload a new one.', 'warning', 'driver', '/driver/profile', NOW() - INTERVAL '1 day'),
      (v_org, NULL, 'Next week''s roster is published', 'Check your shifts for next week in the Roster tab.', 'info', 'all', '/driver/roster', NOW() - INTERVAL '5 hours');
  ELSE
    INSERT INTO notifications (organization_id, driver_id, title, body, type, action_url, created_at) VALUES
      (v_org, NULL, 'Settlements ready to review', 'Last week''s driver settlements are drafted and ready to finalise.', 'info', '/fleet/settlements', NOW() - INTERVAL '3 hours'),
      (v_org, v_driver_ids[1], 'Your settlement is ready', 'Your weekly settlement has been finalised — tap to view.', 'info', '/driver/settlements', NOW() - INTERVAL '2 days');
  END IF;

  RAISE NOTICE 'Test fleet ready (org %). Fleet login: % | Driver login: % | password: %',
    v_org, v_fleet_email, v_driver_email, v_password;
END $$;

-- =============================================================================
-- Verification — one row per login this script created
-- =============================================================================
SELECT u.email AS login, m.role, o.name AS fleet, o.plan, o.status,
       (SELECT count(*) FROM drivers  d WHERE d.organization_id = o.id) AS fleet_drivers,
       (SELECT count(*) FROM vehicles v WHERE v.organization_id = o.id) AS fleet_vehicles,
       (SELECT count(*) FROM driver_shifts s JOIN drivers d ON d.id = s.driver_id WHERE d.user_id = u.id) AS my_shifts,
       (SELECT count(*) FROM driver_settlements s JOIN drivers d ON d.id = s.driver_id WHERE d.user_id = u.id) AS my_settlements
FROM organizations o
JOIN memberships m ON m.organization_id = o.id
JOIN auth.users u  ON u.id = m.user_id
WHERE o.slug = 'rovora-test-fleet'
ORDER BY m.role, u.email;
