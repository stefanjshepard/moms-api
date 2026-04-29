import { PrismaClient } from '@prisma/client';
import { recordSecurityAuditEvent } from './security-audit.service';

const prisma = new PrismaClient();

const parseDays = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const runDataRetentionCleanup = async (): Promise<{
  contactRequestsDeleted: number;
  webhookEventsDeleted: number;
  replayGuardsDeleted: number;
  securityAuditEventsDeleted: number;
}> => {
  const contactRetentionDays = parseDays(process.env.RETENTION_CONTACT_REQUEST_DAYS, 90);
  const webhookRetentionDays = parseDays(process.env.RETENTION_WEBHOOK_EVENT_DAYS, 90);
  const auditRetentionDays = parseDays(process.env.RETENTION_SECURITY_AUDIT_DAYS, 180);

  const contactThreshold = new Date(Date.now() - contactRetentionDays * 24 * 60 * 60 * 1000);
  const webhookThreshold = new Date(Date.now() - webhookRetentionDays * 24 * 60 * 60 * 1000);
  const auditThreshold = new Date(Date.now() - auditRetentionDays * 24 * 60 * 60 * 1000);

  const [contactDelete, webhookDelete, replayGuardDelete, auditDelete] = await prisma.$transaction([
    prisma.contactRequest.deleteMany({
      where: { createdAt: { lt: contactThreshold } },
    }),
    prisma.integrationWebhookEvent.deleteMany({
      where: { createdAt: { lt: webhookThreshold } },
    }),
    prisma.webhookReplayGuard.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }),
    prisma.securityAuditEvent.deleteMany({
      where: { createdAt: { lt: auditThreshold } },
    }),
  ]);

  await recordSecurityAuditEvent({
    eventType: 'data.retention.cleanup',
    outcome: 'accepted',
    severity: 'info',
    metadata: {
      contactRequestsDeleted: contactDelete.count,
      webhookEventsDeleted: webhookDelete.count,
      replayGuardsDeleted: replayGuardDelete.count,
      securityAuditEventsDeleted: auditDelete.count,
    },
  });

  return {
    contactRequestsDeleted: contactDelete.count,
    webhookEventsDeleted: webhookDelete.count,
    replayGuardsDeleted: replayGuardDelete.count,
    securityAuditEventsDeleted: auditDelete.count,
  };
};
