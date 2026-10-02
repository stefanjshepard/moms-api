-- AlterTable
ALTER TABLE "CircleFlyer" ADD COLUMN "calendarEventId" TEXT;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "circleFlyerId" TEXT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_circleFlyerId_fkey" FOREIGN KEY ("circleFlyerId") REFERENCES "CircleFlyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
