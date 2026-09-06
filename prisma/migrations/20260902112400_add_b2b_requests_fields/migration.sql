-- AlterEnum
ALTER TYPE "LeadStatus" ADD VALUE 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "b2bAgentId" TEXT,
ADD COLUMN     "budget" DOUBLE PRECISION,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "days" INTEGER,
ADD COLUMN     "rooms" INTEGER;

-- CreateIndex
CREATE INDEX "Lead_b2bAgentId_idx" ON "Lead"("b2bAgentId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_b2bAgentId_fkey" FOREIGN KEY ("b2bAgentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

