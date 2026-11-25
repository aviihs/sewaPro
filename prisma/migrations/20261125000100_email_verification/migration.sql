-- Email verification and password reset codes replace phone-OTP login (D-088).

-- Outstanding codes are short-lived; old phone login codes are no longer usable.
DELETE FROM "otp_codes";

-- AlterEnum
CREATE TYPE "OtpPurpose_new" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
ALTER TABLE "otp_codes" ALTER COLUMN "purpose" TYPE "OtpPurpose_new" USING ("purpose"::text::"OtpPurpose_new");
ALTER TYPE "OtpPurpose" RENAME TO "OtpPurpose_old";
ALTER TYPE "OtpPurpose_new" RENAME TO "OtpPurpose";
DROP TYPE "public"."OtpPurpose_old";

-- DropIndex
DROP INDEX "otp_codes_phone_purpose_created_at_idx";

-- AlterTable
ALTER TABLE "otp_codes" DROP COLUMN "phone",
ADD COLUMN     "recipient" VARCHAR(254) NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3);

-- Accounts that existed before email verification keep signing in.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email" IS NOT NULL;

-- CreateIndex
CREATE INDEX "otp_codes_recipient_purpose_created_at_idx" ON "otp_codes"("recipient", "purpose", "created_at");
