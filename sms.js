const axios = require('axios');
const { getAccessToken } = require('./auth');
require('dotenv').config();

// Function to send SMS
async function sendSMS(toPhoneNumber, fromPhoneNumber, messageBody) {
  try {
    // Get access token first
    const accessToken = await getAccessToken();
    
    // Prepare the request payload
    const payload = {
      toPhoneNumber: toPhoneNumber,
      fromPhoneNumber: fromPhoneNumber,
      messageBody: messageBody
    };
    
    // Send the SMS request
    const response = await axios.post(
      `https://api.goto.com/connect/v1/sms`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'accountkey': process.env.GOTO_CONNECT_ACCOUNT_KEY
        }
      }
    );
    
    console.log('SMS sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending SMS:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { sendSMS };