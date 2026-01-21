// Mock nodemailer BEFORE importing the service
jest.mock('nodemailer');

import nodemailer from 'nodemailer';
import { sendEmail, verifyEmailConfig } from '../services/email.service';

describe('Email Service', () => {
  const mockTransporter = {
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    verify: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset transporter module-level variable by clearing module cache
    jest.resetModules();
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);
  });

  describe('sendEmail', () => {
    it('should send an email successfully', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const html = '<p>Test HTML</p>';
      const text = 'Test Text';

      await sendEmail(to, subject, html, text);

      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: expect.stringContaining('noreply@example.com'),
        to,
        subject,
        text,
        html,
      });
    });

    it('should generate plain text from HTML if text not provided', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const html = '<p>Test <strong>HTML</strong></p>';

      await sendEmail(to, subject, html);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test HTML', // Should strip HTML tags
        })
      );
    });

    it('should use FROM_EMAIL environment variable if set', async () => {
      const originalFromEmail = process.env.FROM_EMAIL;
      process.env.FROM_EMAIL = 'custom@example.com';

      await sendEmail('test@example.com', 'Test', '<p>Test</p>');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringContaining('custom@example.com'),
        })
      );

      process.env.FROM_EMAIL = originalFromEmail;
    });

    it('should use FROM_NAME environment variable if set', async () => {
      const originalFromName = process.env.FROM_NAME;
      process.env.FROM_NAME = 'Test Business';

      await sendEmail('test@example.com', 'Test', '<p>Test</p>');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringContaining('Test Business'),
        })
      );

      process.env.FROM_NAME = originalFromName;
    });

    it('should handle email sending errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP Error'));

      // Should not throw
      await expect(sendEmail('test@example.com', 'Test', '<p>Test</p>')).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending email:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    it('should not log email details in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      process.env.NODE_ENV = 'production';

      await sendEmail('test@example.com', 'Test', '<p>Test</p>');

      expect(consoleLogSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      consoleLogSpy.mockRestore();
    });
  });

  describe('verifyEmailConfig', () => {
    it('should verify email configuration successfully', async () => {
      const result = await verifyEmailConfig();
      expect(result).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should return false if verification fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockTransporter.verify.mockRejectedValueOnce(new Error('Verification failed'));

      const result = await verifyEmailConfig();
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Email configuration verification failed:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
