import * as Notifications from 'expo-notifications';

export const sendPushNotification = async (expoPushToken, message, data = {}, title = 'CareBeacon') => {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: expoPushToken,
      sound: 'default',
      title,
      body: message,
      data,
    }),
  });
  const result = await response.json();
  if (result.errors) {
    console.error('Push notification errors:', result.errors);
  } else {
    console.log('Push notification sent successfully:', result);
  }
};