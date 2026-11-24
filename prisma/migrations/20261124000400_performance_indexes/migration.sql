-- Step 12: indexes for every list filter/sort, and trigram indexes for admin name search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "bookings_customer_id_scheduled_at_idx" ON "bookings"("customer_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "bookings_status_scheduled_at_idx" ON "bookings"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "bookings_scheduled_at_idx" ON "bookings"("scheduled_at");

-- CreateIndex
CREATE INDEX "providers_verification_status_submitted_at_idx" ON "providers"("verification_status", "submitted_at");

-- CreateIndex
CREATE INDEX "providers_business_name_trgm_idx" ON "providers" USING GIN ("business_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "users_full_name_trgm_idx" ON "users" USING GIN ("full_name" gin_trgm_ops);

