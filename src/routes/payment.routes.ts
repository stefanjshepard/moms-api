import express, { Request, Response } from 'express';
import Joi from 'joi';
import { createIntuitCheckoutSession } from '../services/payment.service';
import { verifyBookingAccessToken } from '../services/booking-token.service';
import { paymentLimiter } from '../middleware/rateLimit';
import { recordSecurityAuditEvent } from '../services/security-audit.service';

const paymentRouter = express.Router();

const checkoutSchema = Joi.object({
  appointmentId: Joi.string().uuid().required(),
  bookingToken: Joi.string().min(16).optional(),
  tipAmount: Joi.number().min(0).optional(),
  currency: Joi.string().length(3).uppercase().optional(),
});

paymentRouter.post('/intuit/checkout-session', paymentLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = checkoutSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const tokenHeader = req.headers['x-booking-token'];
    const bookingToken =
      typeof tokenHeader === 'string'
        ? tokenHeader
        : typeof value.bookingToken === 'string'
          ? value.bookingToken
          : null;
    if (!bookingToken) {
      await recordSecurityAuditEvent({
        eventType: 'checkout.token_missing',
        outcome: 'rejected',
        severity: 'warning',
        provider: 'intuit',
        appointmentId: value.appointmentId,
      });
      res.status(401).json({ error: 'Booking token is required for checkout session creation.' });
      return;
    }
    const tokenValidation = verifyBookingAccessToken(bookingToken, {
      expectedAppointmentId: value.appointmentId,
    });
    if (!tokenValidation.valid) {
      await recordSecurityAuditEvent({
        eventType: 'checkout.token_invalid',
        outcome: 'rejected',
        severity: 'warning',
        provider: 'intuit',
        appointmentId: value.appointmentId,
        metadata: { reason: tokenValidation.reason },
      });
      res.status(401).json({ error: 'Invalid or expired booking token.' });
      return;
    }

    const session = await createIntuitCheckoutSession({
      appointmentId: value.appointmentId,
      tipAmount: value.tipAmount,
      currency: value.currency,
      bookingEmail: tokenValidation.payload.email,
    });
    await recordSecurityAuditEvent({
      eventType: 'checkout.session_created',
      outcome: 'accepted',
      severity: 'info',
      provider: 'intuit',
      appointmentId: value.appointmentId,
      metadata: {
        externalPaymentId: session.externalPaymentId,
      },
    });
    res.status(201).json(session);
  } catch (error) {
    console.error('Error creating Intuit checkout session:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    if (message === 'Appointment not found') {
      res.status(404).json({ error: message });
      return;
    }
    if (message === 'Booking token does not match appointment owner.') {
      res.status(401).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default paymentRouter;
