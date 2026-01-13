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
const createTransporter = () => {
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

const transporter = createTransporter();

// Email sending function
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  text?: string
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

    const info = await transporter.sendMail(mailOptions);
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('Email sent:', info.messageId);
    }
  } catch (error) {
    // Log error but don't throw - we don't want email failures to break the API
    console.error('Error sending email:', error);
    // In production, you might want to log to an error tracking service
  }
};

// Verify email configuration
export const verifyEmailConfig = async (): Promise<boolean> => {
  try {
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', error);
    return false;
  }
};
