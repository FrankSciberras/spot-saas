-- =============================================================================
-- WHICH MIGRATIONS ARE STILL MISSING?
-- =============================================================================
-- Paste this into Supabase -> SQL Editor -> Run.
-- It checks each migration's tell-tale table/column and tells you, in order,
-- which ones still need to be run. Run the "NOT RUN" ones top-to-bottom.
-- =============================================================================

SELECT migration,
       CASE WHEN applied THEN '✅ applied'
            ELSE '❌ NOT RUN — run this one' END AS status
FROM (
  SELECT 1  AS ord, '20260603_dynamic_plans'            AS migration, to_regclass('public.plans') IS NOT NULL AS applied
  UNION ALL SELECT 2,  '20260604_flexible_settlements',   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='settlement_driver_share_pct')
  UNION ALL SELECT 3,  '20260604_platform_notifications', to_regclass('public.platform_broadcasts') IS NOT NULL
  UNION ALL SELECT 4,  '20260605_notification_dedup',     to_regclass('public.notification_dedup') IS NOT NULL
  UNION ALL SELECT 5,  '20260606_seed_notification_rules',to_regprocedure('public.seed_default_notification_rules(uuid)') IS NOT NULL
  UNION ALL SELECT 6,  '20260607_stripe_billing',         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='subscription_status')
  UNION ALL SELECT 7,  '20260608_connect_stripe_products',EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='stripe_product_id')
  UNION ALL SELECT 8,  '20260608_password_reset_throttle',to_regclass('public.password_reset_throttle') IS NOT NULL
  UNION ALL SELECT 9,  '20260609_driver_push_prompt',     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='prompt_drivers_push')
  UNION ALL SELECT 10, '20260610_driver_self_update_guard',to_regprocedure('public.guard_driver_self_update()') IS NOT NULL
  UNION ALL SELECT 11, '20260610_private_storage_buckets', EXISTS (SELECT 1 FROM storage.buckets WHERE id='documents' AND public=false)
  UNION ALL SELECT 12, '20260610_settlement_presets',     to_regclass('public.settlement_presets') IS NOT NULL
  UNION ALL SELECT 13, '20260611_org_platforms',          to_regclass('public.org_platforms') IS NOT NULL
  UNION ALL SELECT 14, '20260612_freeze_adjustments',     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_settlements' AND column_name='total_adjustments')
  UNION ALL SELECT 15, '20260613_recurring_adjustments',  to_regclass('public.recurring_adjustments') IS NOT NULL
  UNION ALL SELECT 16, '20260614_driver_tracking',        to_regclass('public.driver_positions') IS NOT NULL
  UNION ALL SELECT 17, '20260615_geofences_tracking_logs',to_regclass('public.geofences') IS NOT NULL
  UNION ALL SELECT 18, '20260616_tracking_intelligence',  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='speed_limit_kmh')
  UNION ALL SELECT 19, '20260617_plan_vehicle_addons',    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='included_vehicles')
  UNION ALL SELECT 20, '20260709_pay_models',             EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlement_presets' AND column_name='hourly_rate')
  UNION ALL SELECT 21, '20260710_org_modules',            to_regclass('public.org_modules') IS NOT NULL
  UNION ALL SELECT 22, '20260711_pricing_enterprise_tier',EXISTS (SELECT 1 FROM public.plans WHERE key='enterprise')
  UNION ALL SELECT 23, '20260712_service_due_engine',     EXISTS (SELECT 1 FROM pg_proc WHERE proname='seed_default_notification_rules' AND prosrc LIKE '%service_due%')
  UNION ALL SELECT 24, '20260713_parts_inventory',        to_regclass('public.parts') IS NOT NULL
  UNION ALL SELECT 25, '20260714_device_health',          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_positions' AND column_name='battery_pct')
  UNION ALL SELECT 26, '20260715_trip_history',           to_regclass('public.driver_trip_segments') IS NOT NULL
  UNION ALL SELECT 27, '20260716_driver_behaviour',       to_regclass('public.driver_behavior_events') IS NOT NULL
) t
ORDER BY ord;
