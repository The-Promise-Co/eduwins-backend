/**
 * Send OTP via SMS
 * In test/development mode, logs to console
 * @param {string} phone - Phone number
 * @param {string} otp - OTP to send
 */
async function sendOTP(phone, otp) {
  try {
    console.log(`\n📱 SMS OTP REQUEST:`);
    console.log(`   Phone: ${phone}`);
    console.log(`   OTP Code: ${otp}`);
    console.log(`   Message: Your EduWins OTP is: ${otp}. Valid for 10 minutes.\n`);
    
    // For production, implement actual SMS sending here with Termii/Twilio
    // For now, this logs to backend console which is enough for testing
  } catch (error) {
    console.error(`⚠️ OTP logging failed:`, error.message);
  }
}

module.exports = { sendOTP };
