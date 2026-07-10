import logger from './logger';

/**
 * Send OTP via SMS
 * In test/development mode, logs to console
 * @param {string} phone - Phone number
 * @param {string} otp - OTP to send
 */
export async function sendOTP(phone: string, otp: string): Promise<void> {
  try {
    logger.debug({ phone, otp }, 'sms.otp_requested');
    
    // For production, implement actual SMS sending here with Termii/Twilio
  } catch (error: any) {
    logger.error({ err: error, phone }, 'sms.otp_log_failed');
  }
}

/**
 * Generic send SMS function
 * @param {string} phone - Phone number
 * @param {string} message - Message to send
 */
export async function sendSMS(phone: string, message: string): Promise<void> {
  try {
    logger.debug({ phone, message }, 'sms.send_requested');
    
    // For production, implement actual SMS sending here
  } catch (error: any) {
    logger.error({ err: error, phone }, 'sms.log_failed');
  }
}
