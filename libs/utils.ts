import crypto from 'crypto';

export const generateReference = () => {
    // Generate a unique ID using crypto.randomBytes and encode it in base64
    const uniqueID = crypto.randomBytes(16).toString('base64');

    // Replace non-alphanumeric characters with an empty string
    const cleanedId = uniqueID.replace(/[^a-zA-Z0-9]/g, '');

    // Add a custom preffix
    const reference = 'sync' + cleanedId;

    return reference;
};