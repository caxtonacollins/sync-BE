import axios from 'axios';
import crypto from 'crypto';

export const getAccessToken = async () => {
  const key = process.env.MONNIFY_API_KEY;
  const secret = process.env.MONNIFY_SECRET_KEY;
  const accessToken = process.env.MONNIFY_ACCESSTOKEN_URL;

  if (!key || !secret || !accessToken) {
    throw new Error('Please make sure all environment variables are defined.');
  }

  const basicAuth = Buffer.from(`${key}:${secret}`).toString('base64');

  const response = await axios.post(
    accessToken,
    {
      body: '',
    },
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    },
  );
  return response.data.responseBody.accessToken;
};

export const generateReference = () => {
  // Generate a unique ID using crypto.randomBytes and encode it in base64
  const uniqueID = crypto.randomBytes(16).toString('base64');

  // Replace non-alphanumeric characters with an empty string
  const cleanedId = uniqueID.replace(/[^a-zA-Z0-9]/g, '');

  // Add a custom preffix
  const reference = 'sync' + cleanedId;

  return reference;
};
