// Centralized Router AFTER src/index

import express from "express";
import clientRouter from './client.routes';
import serviceRouter from './service.routes';
import appointmentRouter from './appointment.routes';
import testimonialRouter from './testimonial.routes';
import blogPostRouter from './blogPost.routes';
import { adminAuth } from '../middleware/auth';
import contactRouter from "./contact.routes";
import emailRouter from "./email.routes";
import oauthRouter from './oauth.routes';

const router = express.Router();

// Public routes (no authentication needed)
router.use('/appointments', appointmentRouter);
router.use('/services', serviceRouter);
router.use('/testimonials', testimonialRouter);
router.use('/blog', blogPostRouter);
router.use('/contact', contactRouter);
router.use('/oauth', oauthRouter);

// Admin routes (require admin authentication)
router.use('/admin/clients', adminAuth, clientRouter);
router.use('/admin/services', adminAuth, serviceRouter);
router.use('/admin/testimonials', adminAuth, testimonialRouter);
router.use('/admin/blog-posts', adminAuth, blogPostRouter);
router.use('/admin/email', adminAuth, emailRouter);

export default router;