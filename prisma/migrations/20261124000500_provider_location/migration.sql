-- Step 6: nearby search. See docs/DECISIONS.md D-079.
-- PostGIS is required from here on (migration 0200 only created it when available).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Derived from latitude/longitude by Postgres, so it can never drift from them.
ALTER TABLE "providers" ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography) STORED;

-- ST_DWithin on geography uses this index.
CREATE INDEX "providers_location_gist" ON "providers" USING GIST ("location");
