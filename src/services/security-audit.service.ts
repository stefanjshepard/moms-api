import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type SecurityAuditSeverity = 'info' | 'warning' | 'critical';
export type SecurityAuditOutcome = 'accepted' | 'rejected' | 'error';

export const recordSecurityAuditEvent = async (event: {
  eventType: string;
  outcome: SecurityAuditOutcome;
  severity?: SecurityAuditSeverity;
  provider?: string;
  appointmentId?: string | null;
  paymentTransactionId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> => {
  const severity = event.severity ?? 'info';
  const logRecord = {
    at: new Date().toISOString(),
    eventType: event.eventType,
    outcome: event.outcome,
    severity,
    provider: event.provider ?? null,
    appointmentId: event.appointmentId ?? null,
    paymentTransactionId: event.paymentTransactionId ?? null,
    metadata: event.metadata ?? null,
  };

  // Always emit structured logs for external aggregation.
  const method = severity === 'critical' ? console.error : severity === 'warning' ? console.warn : console.log;
  method(JSON.stringify({ type: 'security_audit', ...logRecord }));

  try {
    await prisma.securityAuditEvent.create({
      data: {
        eventType: event.eventType,
        outcome: event.outcome,
        severity,
        provider: event.provider ?? null,
        appointmentId: event.appointmentId ?? null,
        paymentTransactionId: event.paymentTransactionId ?? null,
        metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (error: any) {
    // Older DB snapshots may not have the table yet.
    if (error?.code !== 'P2021') {
      console.error('Failed to persist security audit event:', error);
    }
  }
};
