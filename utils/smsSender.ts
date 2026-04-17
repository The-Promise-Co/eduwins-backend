/**
 * Send OTP via SMS
 * In test/development mode, logs to console
 * @param {string} phone - Phone number
 * @param {string} otp - OTP to send
 */
export async function sendOTP(phone: string, otp: string): Promise<void> {
  try {
    console.log(`\n📱 SMS OTP REQUEST:`);
    console.log(`   Phone: ${phone}`);
    console.log(`   OTP Code: ${otp}`);
    console.log(`   Message: Your EduWins OTP is: ${otp}. Valid for 10 minutes.\n`);
    
    // For production, implement actual SMS sending here with Termii/Twilio
  } catch (error: any) {
    console.error(`⚠️ OTP logging failed:`, error.message);
  }
}

/**
 * Generic send SMS function
 * @param {string} phone - Phone number
 * @param {string} message - Message to send
 */
export async function sendSMS(phone: string, message: string): Promise<void> {
  try {
    console.log(`\n📱 SMS SEND REQUEST:`);
    console.log(`   Phone: ${phone}`);
    console.log(`   Message: ${message}\n`);
    
    // For production, implement actual SMS sending here
  } catch (error: any) {
    console.error(`⚠️ SMS logging failed:`, error.message);
  }
}
