-- Hand-written: constraints Prisma cannot express. See docs/DECISIONS.md D-022..D-024.

-- btree_gist lets the booking exclusion constraint mix equality (provider) with range overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- PostGIS is optional until Step 6 (search): create it only when the server has it installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis;
  ELSE
    RAISE NOTICE 'PostGIS not installed; skipping (required from Step 6).';
  END IF;
END
$$;

-- Double-booking protection: a provider cannot hold two live bookings whose
-- [scheduled_at, scheduled_end_at) windows overlap. Cancelled/rejected bookings free the slot.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_end_after_start_chk" CHECK ("scheduled_end_at" > "scheduled_at"),
  ADD CONSTRAINT "bookings_amounts_non_negative_chk" CHECK (
    ("quoted_price" IS NULL OR "quoted_price" >= 0) AND
    ("estimated_amount" IS NULL OR "estimated_amount" >= 0) AND
    ("final_amount" IS NULL OR "final_amount" >= 0)
  ),
  ADD CONSTRAINT "bookings_no_provider_overlap" EXCLUDE USING gist (
    "provider_id" WITH =,
    tstzrange("scheduled_at", "scheduled_end_at", '[)') WITH &&
  ) WHERE ("status" NOT IN ('CANCELLED', 'REJECTED'));

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_ratings_range_chk" CHECK (
    "overall" BETWEEN 1 AND 5 AND "service_quality" BETWEEN 1 AND 5 AND
    "professionalism" BETWEEN 1 AND 5 AND "punctuality" BETWEEN 1 AND 5 AND
    "communication" BETWEEN 1 AND 5
  );

ALTER TABLE "providers"
  ADD CONSTRAINT "providers_rating_range_chk" CHECK ("rating_average" BETWEEN 0 AND 5 AND "rating_count" >= 0),
  ADD CONSTRAINT "providers_counters_chk" CHECK ("completed_jobs" >= 0 AND "experience_years" BETWEEN 0 AND 70),
  ADD CONSTRAINT "providers_radius_chk" CHECK ("service_radius_km" BETWEEN 1 AND 100),
  ADD CONSTRAINT "providers_coordinates_chk" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);

ALTER TABLE "addresses"
  ADD CONSTRAINT "addresses_coordinates_chk" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_window_chk" CHECK (
    "day_of_week" BETWEEN 0 AND 6 AND "start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute"
  );

ALTER TABLE "provider_settings"
  ADD CONSTRAINT "provider_settings_range_chk" CHECK (
    "max_daily_bookings" BETWEEN 1 AND 50 AND "slot_minutes" BETWEEN 15 AND 480
  );

ALTER TABLE "provider_services"
  ADD CONSTRAINT "provider_services_price_chk" CHECK (
    ("pricing_type" = 'QUOTATION' AND "price" IS NULL) OR
    ("pricing_type" <> 'QUOTATION' AND "price" IS NOT NULL AND "price" >= 0)
  );

ALTER TABLE "quotations"
  ADD CONSTRAINT "quotations_amounts_chk" CHECK (
    "labour_cost" >= 0 AND "material_cost" >= 0 AND "total" = "labour_cost" + "material_cost"
  );

ALTER TABLE "otp_codes"
  ADD CONSTRAINT "otp_codes_attempts_chk" CHECK ("attempts" >= 0);
