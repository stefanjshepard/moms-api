-- AlterTable
ALTER TABLE "Service" ADD COLUMN "bookingMode" TEXT NOT NULL DEFAULT 'appointment';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'session';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "quotedAmount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CircleFlyer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "eventStart" TIMESTAMP(3) NOT NULL,
    "eventEnd" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "serviceId" TEXT,
    "availabilityExceptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircleFlyer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CircleFlyer" ADD CONSTRAINT "CircleFlyer_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
