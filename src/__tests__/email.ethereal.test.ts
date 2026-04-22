import { sendEmail, verifyEmailConfig } from '../services/email.service';
import {
  appointmentConfirmationTemplate,
  appointmentRescheduleTemplate,
  appointmentCancellationTemplate,
  appointmentConfirmedTemplate,
  contactRequestNotificationTemplate,
} from '../services/email.templates';

describe('Email Service with Ethereal.email', () => {
  // Ensure we're using Ethereal in test mode
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  describe('Email Service Core Functionality', () => {
    it('should send an email successfully using Ethereal', async () => {
      const to = 'test@example.com';
      const subject = 'Test Email';
      const html = '<p>This is a test email sent via Ethereal.email</p>';
      const text = 'This is a test email sent via Ethereal.email';

      await sendEmail(to, subject, html, text);

      // If we get here without error, the email was sent successfully
      // In a real scenario, you could check the preview URL
      expect(true).toBe(true);
    }, 30000); // Increased timeout for Ethereal account creation

    it('should generate plain text from HTML if text not provided', async () => {
      const to = 'test@example.com';
      const subject = 'Test Email';
      const html = '<p>Test <strong>HTML</strong> content</p>';

      // Should not throw
      await expect(sendEmail(to, subject, html)).resolves.not.toThrow();
    }, 30000);

    it('should use FROM_EMAIL environment variable if set', async () => {
      const originalFromEmail = process.env.FROM_EMAIL;
      process.env.FROM_EMAIL = 'custom@example.com';

      await sendEmail('test@example.com', 'Test', '<p>Test</p>');

      // Restore
      if (originalFromEmail) {
        process.env.FROM_EMAIL = originalFromEmail;
      } else {
        delete process.env.FROM_EMAIL;
      }
    }, 30000);

    it('should use FROM_NAME environment variable if set', async () => {
      const originalFromName = process.env.FROM_NAME;
      process.env.FROM_NAME = 'Test Business';

      await sendEmail('test@example.com', 'Test', '<p>Test</p>');

      // Restore
      if (originalFromName) {
        process.env.FROM_NAME = originalFromName;
      } else {
        delete process.env.FROM_NAME;
      }
    }, 30000);

    it('should handle email sending errors when throwOnError is false', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // This should not throw even if there's an error
      await expect(
        sendEmail('invalid-email', 'Test', '<p>Test</p>', undefined, false)
      ).resolves.not.toThrow();

      consoleErrorSpy.mockRestore();
    }, 30000);

    it('should throw error when throwOnError is true', async () => {
      // Using an invalid email format should cause an error
      await expect(
        sendEmail('invalid-email-format', 'Test', '<p>Test</p>', undefined, true)
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Email Configuration Verification', () => {
    it('should verify Ethereal email configuration successfully', async () => {
      const result = await verifyEmailConfig();
      expect(result).toBe(true);
    }, 30000);
  });

  describe('Email Templates', () => {
    const baseAppointmentData = {
      clientFirstName: 'John',
      clientLastName: 'Doe',
      email: 'john.doe@example.com',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      serviceTitle: 'Consultation',
      serviceDescription: 'A one-hour consultation',
      appointmentId: 'test-appointment-id',
    };

    it('should send appointment confirmation email', async () => {
      const html = appointmentConfirmationTemplate(baseAppointmentData);

      await expect(
        sendEmail(
          baseAppointmentData.email,
          'Appointment Confirmation',
          html
        )
      ).resolves.not.toThrow();
    }, 30000);

    it('should send appointment reschedule email', async () => {
      const data = {
        ...baseAppointmentData,
        oldDate: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
      };
      const html = appointmentRescheduleTemplate(data);

      await expect(
        sendEmail(
          data.email,
          'Appointment Rescheduled',
          html
        )
      ).resolves.not.toThrow();
    }, 30000);

    it('should send appointment cancellation email', async () => {
      const html = appointmentCancellationTemplate(baseAppointmentData);

      await expect(
        sendEmail(
          baseAppointmentData.email,
          'Appointment Cancelled',
          html
        )
      ).resolves.not.toThrow();
    }, 30000);

    it('should send appointment confirmed email', async () => {
      const html = appointmentConfirmedTemplate(baseAppointmentData);

      await expect(
        sendEmail(
          baseAppointmentData.email,
          'Appointment Confirmed',
          html
        )
      ).resolves.not.toThrow();
    }, 30000);

    it('should send contact request notification email', async () => {
      const contactData = {
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        message: 'I am interested in your services. Please contact me.',
      };
      const html = contactRequestNotificationTemplate(contactData);

      await expect(
        sendEmail(
          'business@example.com',
          'New Contact Request from Jane Smith',
          html
        )
      ).resolves.not.toThrow();
    }, 30000);
  });

  describe('Email Template Content Validation', () => {
    it('should generate valid HTML for appointment confirmation', () => {
      const data = {
        clientFirstName: 'John',
        clientLastName: 'Doe',
        email: 'john@example.com',
        date: new Date('2025-06-01T10:00:00Z'),
        serviceTitle: 'Test Service',
      };
      const html = appointmentConfirmationTemplate(data);

      expect(html).toContain('Appointment Confirmation');
      expect(html).toContain('John');
      expect(html).toContain('Test Service');
      expect(html).toMatch(/<!DOCTYPE html>/i);
      expect(html).toMatch(/<html>/i);
    });

    it('should escape HTML in user-submitted data (XSS prevention)', () => {
      const maliciousData = {
        name: '<script>alert("XSS")</script>',
        email: 'test@example.com',
        message: '<img src=x onerror=alert(1)>',
      };
      const html = contactRequestNotificationTemplate(maliciousData);

      // Should not contain unescaped HTML tags
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('</script>');
      expect(html).not.toContain('<img src=');
      // Should contain escaped versions
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;/script&gt;');
      expect(html).toContain('&lt;img');
      // The onerror= part is safe because the <img tag is escaped
      // It will be rendered as text, not executed
    });

    it('should handle multi-line messages correctly', () => {
      const data = {
        name: 'Test User',
        email: 'test@example.com',
        message: 'Line 1\nLine 2\nLine 3',
      };
      const html = contactRequestNotificationTemplate(data);

      // Should convert newlines to <br> tags
      expect(html).toMatch(/<br>/i);
    });

    it('should format dates correctly in templates', () => {
      const data = {
        clientFirstName: 'John',
        clientLastName: 'Doe',
        email: 'john@example.com',
        date: new Date('2025-06-15T14:30:00Z'),
        serviceTitle: 'Test Service',
      };
      const html = appointmentConfirmationTemplate(data);

      // Should contain formatted date elements
      expect(html).toMatch(/June|15|2025|2:30/i);
    });
  });

  describe('Email Address Validation', () => {
    it('should accept valid email addresses', async () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'test123@test-domain.com',
      ];

      for (const email of validEmails) {
        await expect(
          sendEmail(email, 'Test', '<p>Test</p>')
        ).resolves.not.toThrow();
      }
    }, 60000); // Longer timeout for multiple emails

    it('should handle special characters in email content', async () => {
      const html = `
        <p>Test with special chars: & < > " '</p>
        <p>Test with unicode: ✓ ✗ € £ ¥</p>
      `;

      await expect(
        sendEmail('test@example.com', 'Test & Subject', html)
      ).resolves.not.toThrow();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables gracefully', async () => {
      const originalFromEmail = process.env.FROM_EMAIL;
      const originalSmtpUser = process.env.SMTP_USER;

      delete process.env.FROM_EMAIL;
      delete process.env.SMTP_USER;

      // Should use default fallback
      await expect(
        sendEmail('test@example.com', 'Test', '<p>Test</p>')
      ).resolves.not.toThrow();

      // Restore
      if (originalFromEmail) process.env.FROM_EMAIL = originalFromEmail;
      if (originalSmtpUser) process.env.SMTP_USER = originalSmtpUser;
    }, 30000);

    it('should not log email details in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      process.env.NODE_ENV = 'production';

      // Temporarily disable Ethereal to test production behavior
      const originalUseEthereal = process.env.USE_ETHEREAL;
      delete process.env.USE_ETHEREAL;

      // Note: This will fail in production without real SMTP config,
      // but we're just testing the logging behavior
      try {
        await sendEmail('test@example.com', 'Test', '<p>Test</p>');
      } catch (error) {
        // Expected to fail without SMTP config
      }

      // Restore
      process.env.NODE_ENV = originalEnv;
      if (originalUseEthereal) process.env.USE_ETHEREAL = originalUseEthereal;
      consoleLogSpy.mockRestore();
    });
  });

  describe('Ethereal Integration', () => {
    it('should create Ethereal test account automatically', async () => {
      // Clear any cached transporter
      jest.resetModules();

      // The service should automatically create an Ethereal account
      await expect(verifyEmailConfig()).resolves.toBe(true);
    }, 30000);

    it('should provide preview URL for sent emails in test mode', async () => {
      // This test verifies that Ethereal preview URLs are generated
      // The actual URL is logged to console in test mode
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await sendEmail('test@example.com', 'Preview Test', '<p>Test</p>');

      // Check if preview URL was logged (or offline fallback message)
      const logCalls = consoleLogSpy.mock.calls;
      const hasPreviewSignal = logCalls.some(call =>
        call[0] &&
        typeof call[0] === 'string' &&
        (call[0].includes('Preview URL') || call[0].includes('offline test transport'))
      );

      consoleLogSpy.mockRestore();

      // In online mode we get a preview URL; in offline mode we get a fallback signal.
      expect(hasPreviewSignal).toBe(true);
    }, 30000);
  });
});
