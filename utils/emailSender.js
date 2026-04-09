const nodemailer = require('nodemailer');

/**
 * Send OTP via Email
 * @param {string} email - Email address
 * @param {string} otp - OTP to send
 */
async function sendOTP(email, otp) {
  try {
    if (!email) {
      console.log(`⚠️ Email address not provided`);
      return;
    }

    // Check if Gmail credentials are provided
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.log(`📧 [TEST MODE] OTP for ${email}: ${otp}`);
      console.log(`✅ In production, this would be sent via email`);
      return;
    }

    // Create transporter for Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'EduWins - Your OTP Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
          <div style="background: linear-gradient(135deg, #001A72 0%, #FFB81C 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">EduWins</h1>
            <p style="margin: 10px 0 0 0; font-size: 14px;">Your Code is Here</p>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="margin: 0 0 20px 0; color: #333; font-size: 14px;">Hello,</p>
            <p style="margin: 0 0 20px 0; color: #555; font-size: 14px; line-height: 1.6;">
              You requested a verification code for your EduWins account. Use the code below to verify your account:
            </p>
            <div style="background-color: #001A72; color: white; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-size: 32px; letter-spacing: 5px; font-weight: bold;">${otp}</p>
            </div>
            <p style="margin: 20px 0 0 0; color: #999; font-size: 12px;">
              This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
            </p>
            <p style="margin: 20px 0 0 0; color: #999; font-size: 12px;">
              If you didn't request this code, ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="margin: 10px 0; color: #999; font-size: 12px; text-align: center;">
              © 2024 EduWins. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email} (Message ID: ${info.messageId})`);
  } catch (error) {
    console.error(`⚠️ Email sending failed (non-critical):`, error.message);
    // Don't throw - let registration continue even if email fails
  }
}

module.exports = { sendOTP };
