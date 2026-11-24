-- DropIndex
DROP INDEX "quotations_one_open_per_booking";

-- CreateIndex
CREATE UNIQUE INDEX "quotations_one_open_per_booking" ON "quotations"("booking_id") WHERE (status = 'DRAFT' OR status = 'SENT');

