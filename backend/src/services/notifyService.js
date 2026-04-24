const axios = require('axios');

const FCM_URL = 'https://fcm.googleapis.com/fcm/send';

async function sendPush(fcmToken, title, body) {
  if (!process.env.FCM_SERVER_KEY) return;
  await axios.post(
    FCM_URL,
    { to: fcmToken, notification: { title, body } },
    { headers: { Authorization: `key=${process.env.FCM_SERVER_KEY}` } }
  );
}

module.exports = { sendPush };
