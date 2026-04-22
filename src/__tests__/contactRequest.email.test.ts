// Mock the email service BEFORE importing app
jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  verifyEmailConfig: jest.fn().mockResolvedValue(true),
}));

import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/email.service';
import '../__tests__/setup';

const prisma = new PrismaClient();
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

describe('Contact Request Email Integration', () => {
  const testContactRequest = {
    name: 'John Doe',
    email: 'john.doe@example.com',
    message: 'This is a test message for email functionality',
  };

  const testClient = {
    name: 'Business Owner',
    email: 'owner@example.com',
    aboutMe: 'Test business owner',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Create a client for business owner email fallback
    await prisma.client.create({ data: testClient });
  });

  describe('POST /api/contact - Email Notification', () => {
    it('should send email notification to business owner when contact request is created', async () => {
      // Set BUSINESS_OWNER_EMAIL environment variable
      const originalOwnerEmail = process.env.BUSINESS_OWNER_EMAIL;
      process.env.BUSINESS_OWNER_EMAIL = 'owner@example.com';

      const response = await request(app)
        .post('/api/contact')
        .send(testContactRequest)
        .expect(201);

      // Verify contact request was created
      expect(response.body.name).toBe(testContactRequest.name);
      expect(response.body.email).toBe(testContactRequest.email);

      // Wait longer for async email to be called (promise chain)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify email was sent
      expect(mockSendEmail).toHaveBeenCalled();
      expect(mockSendEmail).toHaveBeenCalledWith(
        'owner@example.com',
        `New Contact Request from ${testContactRequest.name}`,
        expect.stringContaining(testContactRequest.name)
      );

      process.env.BUSINESS_OWNER_EMAIL = originalOwnerEmail;
    });

    it('should fallback to first client email if BUSINESS_OWNER_EMAIL not set', async () => {
      const originalOwnerEmail = process.env.BUSINESS_OWNER_EMAIL;
      delete process.env.BUSINESS_OWNER_EMAIL;

      await request(app).post('/api/contact').send(testContactRequest).expect(201);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should use client email from database
      expect(mockSendEmail).toHaveBeenCalled();
      expect(mockSendEmail).toHaveBeenCalledWith(
        testClient.email,
        expect.any(String),
        expect.any(String)
      );

      process.env.BUSINESS_OWNER_EMAIL = originalOwnerEmail;
    });

    it('should not fail if email sending fails', async () => {
      mockSendEmail.mockRejectedValueOnce(new Error('Email send failed'));

      const response = await request(app)
        .post('/api/contact')
        .send(testContactRequest)
        .expect(201);

      // Contact request should still be created
      expect(response.body.name).toBe(testContactRequest.name);
    });

    it('should include contact details in email content', async () => {
      process.env.BUSINESS_OWNER_EMAIL = 'owner@example.com';

      await request(app).post('/api/contact').send(testContactRequest).expect(201);

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(mockSendEmail).toHaveBeenCalled();
      const emailCall = mockSendEmail.mock.calls[0];
      expect(emailCall).toBeDefined();
      const emailHtml = emailCall[2] as string;

      expect(emailHtml).toContain(testContactRequest.name);
      expect(emailHtml).toContain(testContactRequest.email);
      expect(emailHtml).toContain(testContactRequest.message);
    });
  });
});
