import { emailService } from '../utils/emailSender';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testEmail() {
  console.log('Testing Email Service...\n');

  // Test OTP
  console.log('1. Testing sendOTP...');
  await emailService.sendOTP('test@example.com', '123456');

  // Test Welcome Email
  console.log('2. Testing sendWelcomeEmail...');
  await emailService.sendWelcomeEmail('user@example.com', 'John Doe');

  // Test Generic Email
  console.log('3. Testing generic sendEmail...');
  await emailService.sendEmail({
    to: 'recipient@example.com',
    subject: 'Service Notification',
    html: '<p>This is a custom notification</p>'
  });

  console.log('\nTesting Complete.');
}

testEmail().catch(err => {
  console.error('Test failed:', err);
});
