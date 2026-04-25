import express, { Request, Response } from 'express';
import { sendEmail, verifyEmailConfig } from '../services/email.service';
import { dispatchDueAppointmentReminders } from '../services/reminder.service';

const emailRouter = express.Router();

// Verification endpoint - sends a test email
// Protected by admin auth to prevent abuse
emailRouter.post('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email address is required' });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email address format' });
      return;
    }

    const testEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4a90e2; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #4a90e2; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Email Service Verification</h1>
          </div>
          <div class="content">
            <p>This is a test email to verify that your email service is configured correctly.</p>
            <div class="details">
              <h3>Configuration Details:</h3>
              <p><strong>Status:</strong> Email service is working!</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Recipient:</strong> ${email.replace(/[<>&"']/g, (char: string) => {
      const map: { [key: string]: string } = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#039;' };
      return map[char];
    })}</p>
            </div>
            <p>If you received this email, your email service is properly configured and ready to send emails to customers.</p>
          </div>
          <div class="footer">
            <p>This is a test email from your API email service.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Use throwOnError=true for verification endpoint so we can detect failures
    await sendEmail(
      email,
      'Email Service Verification Test',
      testEmailHtml,
      undefined, // text parameter
      true // throwOnError - we want to know if email fails
    );

    res.json({
      message: 'Test email sent successfully',
      recipient: email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error sending verification email:', error);
    res.status(500).json({
      error: 'Failed to send test email',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Email configuration verification endpoint
emailRouter.get('/config/verify', async (_req: Request, res: Response): Promise<void> => {
  try {
    const isValid = await verifyEmailConfig();

    if (isValid) {
      res.json({
        status: 'success',
        message: 'Email configuration is valid',
        config: {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: process.env.SMTP_PORT || '587',
          fromEmail: process.env.FROM_EMAIL || process.env.SMTP_USER || 'not set',
          fromName: process.env.FROM_NAME || 'Business',
        }
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Email configuration verification failed. Please check your SMTP settings.',
        config: {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: process.env.SMTP_PORT || '587',
          fromEmail: process.env.FROM_EMAIL || process.env.SMTP_USER || 'not set',
        }
      });
    }
  } catch (error) {
    console.error('Error verifying email config:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify email configuration',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Dispatch due reminder jobs (admin-triggered; intended for cron/automation)
emailRouter.post('/reminders/dispatch', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await dispatchDueAppointmentReminders();
    res.json({
      status: 'success',
      message: 'Reminder dispatch completed',
      ...result,
    });
  } catch (error) {
    console.error('Error dispatching reminders:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to dispatch reminders',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default emailRouter;
