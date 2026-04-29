-- CreateTable
CREATE TABLE "WebhookReplayGuard" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReplayGuard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "provider" TEXT,
    "appointmentId" TEXT,
    "paymentTransactionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReplayGuard_provider_signatureHash_key" ON "WebhookReplayGuard"("provider", "signatureHash");

-- CreateIndex
CREATE INDEX "WebhookReplayGuard_expiresAt_idx" ON "WebhookReplayGuard"("expiresAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_eventType_createdAt_idx" ON "SecurityAuditEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_severity_createdAt_idx" ON "SecurityAuditEvent"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_provider_createdAt_idx" ON "SecurityAuditEvent"("provider", "createdAt");
