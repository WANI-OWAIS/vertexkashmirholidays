-- Written by hand instead of via `prisma migrate dev`: that command's
-- shadow-database diff refuses to run because the historical
-- 20260712173655_add_performance_indexes migration was deliberately rewritten
-- to a no-op after being applied (see its own file comment) and its checksum
-- no longer matches what's recorded for databases that already ran it. That
-- drift is pre-existing and unrelated to this change — resolving it is a
-- separate decision for whoever owns the migration history, not something to
-- fix as a side effect of adding these indexes. Apply this file with
-- `prisma migrate deploy` (or `prisma migrate resolve --applied` first if a
-- given database's history needs reconciling), not `migrate dev`.
--
-- Four high-value composite indexes from the performance audit (P0/P1 tier
-- only — see the audit for the remaining P2/P3 candidates, deliberately not
-- added here):
--   - Booking(status, createdAt): admin bookings list filters by status and
--     sorts by createdAt together.
--   - Lead(assignedToId, createdAt): a staff member's own lead queue, sorted
--     by recency.
--   - Lead(status, createdAt): admin leads list filters by status and sorts
--     by createdAt together.
--   - BookingCommission(employeeId, status, earnedAt): an employee's
--     commission ledger, filtered by status and ordered by when it was
--     earned (salary prep / employee commission views).

-- AlterTable
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");

-- AlterTable
CREATE INDEX "Lead_assignedToId_createdAt_idx" ON "Lead"("assignedToId", "createdAt");

-- AlterTable
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- AlterTable
CREATE INDEX "BookingCommission_employeeId_status_earnedAt_idx" ON "BookingCommission"("employeeId", "status", "earnedAt");
