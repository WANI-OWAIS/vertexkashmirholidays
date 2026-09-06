-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateTable
CREATE TABLE "ProposalItinerary" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalItinerary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalItinerary_ownerId_idx" ON "ProposalItinerary"("ownerId");

-- CreateIndex
CREATE INDEX "ProposalItinerary_status_idx" ON "ProposalItinerary"("status");

-- AddForeignKey
ALTER TABLE "ProposalItinerary" ADD CONSTRAINT "ProposalItinerary_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
