-- CreateEnum
CREATE TYPE "B2BAgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'B2B_REGISTER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agencyGstin" TEXT,
ADD COLUMN     "agencyLogoUrl" TEXT,
ADD COLUMN     "agencyName" TEXT,
ADD COLUMN     "agencyRegistrationNumber" TEXT,
ADD COLUMN     "agencyState" TEXT,
ADD COLUMN     "agencyStatus" "B2BAgentStatus",
ADD COLUMN     "agencyWebsite" TEXT;

-- CreateIndex
CREATE INDEX "User_agencyStatus_idx" ON "User"("agencyStatus");

