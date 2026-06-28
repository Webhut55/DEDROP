// paymentReader.js
import { google } from 'googleapis';

export async function checkPayment(auth, orderId, expectedAmount) {
    const gmail = google.gmail({ version: 'v1', auth });
    
    // Search for emails containing your Order ID and the Amount
    const query = `subject:Received "INR ${expectedAmount}" OR "${orderId}"`;
    const res = await gmail.users.messages.list({ userId: 'me', q: query });

    if (res.data.messages) {
        // If an email is found, the payment is confirmed
        return true; 
    }
    return false;
}