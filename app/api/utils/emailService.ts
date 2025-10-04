import Mailjet from 'node-mailjet';
import nodemailer, { Transporter } from 'nodemailer';

// Define custom error type for Mailjet errors
interface MailjetError extends Error {
  statusCode?: number;
  errorMessage?: string;
  errorType?: string;
}

let transporter: Transporter | null = null;
let mailjetClient: Mailjet | null = null;

if (process.env.ENV_NAME === 'production') {
  if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
    console.error('MAILJET_API_KEY and MAILJET_SECRET_KEY environment variables must be set');
  } else {
    mailjetClient = new Mailjet({
      apiKey: process.env.MAILJET_API_KEY,
      apiSecret: process.env.MAILJET_SECRET_KEY,
    });
    console.log('Mailjet client initialized');
    console.log('Using sender email:', process.env.MAILJET_FROM_EMAIL);
  }
} else {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025'),
    secure: false,
    auth: undefined,
  });

  transporter.verify(function (error, success) {
    if (error && process.env.NODE_ENV !== 'test') {
      console.error('SMTP connection error:', error);
    } else if (success && process.env.NODE_ENV !== 'test') {
      console.log('SMTP server is ready to take our messages');
    }
  });
}

export async function sendResetEmail(email: string, token: string) {
  console.log('Attempting to send reset email to:', email);

  const emailContent = {
    subject: 'Password Reset Request - Blueprint Not Included',
    text: `To reset your password, click this link: ${process.env.SITE_URL}/reset-password?token=${token}`,
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your Blueprint Not Included account.</p>
      <p>Click the link below to reset your password:</p>
      <p><a href="${process.env.SITE_URL}/reset-password?token=${token}">Reset Password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>The link will expire in 1 hour.</p>
    `,
  };

  try {
    if (process.env.ENV_NAME === 'production') {
      if (!mailjetClient) {
        throw new Error('Mailjet client not configured');
      }
      if (!process.env.MAILJET_FROM_EMAIL) {
        throw new Error('Mailjet sender email not configured');
      }

      console.log('Sending via Mailjet with configuration:', {
        to: email,
        from: process.env.MAILJET_FROM_EMAIL,
        subject: emailContent.subject,
      });

      const result = await mailjetClient.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: {
              Email: process.env.MAILJET_FROM_EMAIL,
              Name: 'Blueprint Not Included',
            },
            To: [
              {
                Email: email,
              },
            ],
            Subject: emailContent.subject,
            TextPart: emailContent.text,
            HTMLPart: emailContent.html,
          },
        ],
      });

      console.log('Mailjet API Response:', result.body);
      return result.body;
    } else {
      if (!transporter) {
        throw new Error('Email transporter not configured');
      }
      const info = await transporter.sendMail({
        from: process.env.MAILJET_FROM_EMAIL || 'noreply@blueprintnotincluded.com',
        to: email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      console.log('Reset email sent:', info.response);
      return info;
    }
  } catch (error) {
    console.error('Error sending reset email:', error);
    const mailjetError = error as MailjetError;
    if (mailjetError.statusCode) {
      console.error('Mailjet error details:', {
        statusCode: mailjetError.statusCode,
        message: mailjetError.errorMessage,
        type: mailjetError.errorType,
      });
    }
    throw error;
  }
}
