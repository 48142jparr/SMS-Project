const { sendSMS } = require('./sms');

// Define phone numbers and message
const toPhoneNumber = '+15551234567'; // Replace with recipient's number
const fromPhoneNumber = '+15557654321'; // Replace with your GoTo Connect phone number
const messageBody = 'Hello from my GoTo Connect SMS app!';

// Execute the SMS sending function
async function main() {
  try {
    console.log('Sending SMS message...');
    await sendSMS(toPhoneNumber, fromPhoneNumber, messageBody);
    console.log('Process completed successfully.');
  } catch (error) {
    console.error('Failed to send SMS:', error.message);
  }
}

// Run the application
main();