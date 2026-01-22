import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Email configuration interface
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean; // true for 465, false for other ports
  auth: {
    user: string;
    pass: string;
  };
}

// Initialize nodemailer transporter
// In test mode, uses Ethereal.email for testing
const createTransporter = async () => {
  // Use Ethereal.email in test environment
  if (process.env.NODE_ENV === 'test' || process.env.USE_ETHEREAL === 'true') {
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  // Production/development configuration
  const emailConfig: EmailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  };

  return nodemailer.createTransport(emailConfig);
};

// Lazy initialization - transporter is created on first use
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let transporterPromise: Promise<ReturnType<typeof nodemailer.createTransport>> | null = null;

const getTransporter = async () => {
  if (!transporter) {
    if (!transporterPromise) {
      transporterPromise = createTransporter();
    }
    transporter = await transporterPromise;
  }
  return transporter;
};

// Email sending function
// If throwOnError is true, errors will be thrown (useful for verification endpoints)
// If false (default), errors are logged but not thrown (prevents email failures from breaking the API)
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  text?: string,
  throwOnError: boolean = false
): Promise<void> => {
  try {
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@example.com';

    const mailOptions = {
      from: `"${process.env.FROM_NAME || 'Business'}" <${from}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]*>/g, ''), // Plain text version
      html,
    };

    const transporter = await getTransporter();
    const info = await transporter.sendMail(mailOptions);

    // In test mode with Ethereal, log the preview URL
    if (process.env.NODE_ENV === 'test' || process.env.USE_ETHEREAL === 'true') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log('Preview URL:', previewUrl);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Email sent:', info.messageId);
    }
  } catch (error) {
    // Always log the error
    console.error('Error sending email:', error);

    // If throwOnError is true, rethrow the error (for verification endpoints)
    if (throwOnError) {
      throw error;
    }
    // Otherwise, swallow the error - we don't want email failures to break the API
    // In production, you might want to log to an error tracking service
  }
};

// Verify email configuration
export const verifyEmailConfig = async (): Promise<boolean> => {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', error);
    return false;
  }
};
