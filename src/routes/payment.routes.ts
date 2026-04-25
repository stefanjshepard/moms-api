import express, { Request, Response } from 'express';
import Joi from 'joi';
import { appointmentLimiter } from '../middleware/rateLimit';
import { createIntuitCheckoutSession } from '../services/payment.service';

const paymentRouter = express.Router();

const checkoutSchema = Joi.object({
  appointmentId: Joi.string().uuid().required(),
  tipAmount: Joi.number().min(0).optional(),
  currency: Joi.string().length(3).uppercase().optional(),
});

paymentRouter.post('/intuit/checkout-session', appointmentLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = checkoutSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const session = await createIntuitCheckoutSession(value);
    res.status(201).json(session);
  } catch (error) {
    console.error('Error creating Intuit checkout session:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    if (message === 'Appointment not found') {
      res.status(404).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default paymentRouter;
