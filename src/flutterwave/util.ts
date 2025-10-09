// import axios from "axios"

// const client_id = process.env.FLUTTERWAVE_CLIENT_ID!
// const client_secret = process.env.FLUTTERWAVE_CLIENT_SECRET!

// export const flutter_auth = async () => {

//     const response = await axios.post(process.env.FLUTTERWAVE_AUTH_URL!, {
//         client_id,
//         client_secret,
//         grant_type: 'client_credentials'
//     },{
//         headers: {
//             'Content-Type': 'application/x-www-form-urlencoded'
//         },
//     })

//     return response.data
// }


// let accessToken = flutter_auth();
// let expiresIn = 0;
// let lastTokenRefreshTime = 0;

// async function refreshToken() {
//     try {
//         const response = await axios.post(
//             process.env.FLUTTERWAVE_REFRESH_TOKEN_URL!,
//             new URLSearchParams({
//                 client_id,
//                 client_secret,
//                 grant_type: 'client_credentials'
//             }),
//             {
//                 headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
//             }
//         );

//         accessToken = response.data.access_token;
//         expiresIn = response.data.expires_in;
//         lastTokenRefreshTime = Date.now();

//         console.log('New Token:', accessToken);
//         console.log('Expires in:', expiresIn, 'seconds');
//     } catch (error) {
//         console.error('Error refreshing token:', error.response ? error.response.data : error.message);
//     }
// }

// async function ensureTokenIsValid() {
//     const currentTime = Date.now();
//     const timeSinceLastRefresh = (currentTime - lastTokenRefreshTime) / 1000; // convert to seconds
//     const timeLeft = expiresIn - timeSinceLastRefresh;

//     if (!accessToken || timeLeft < 60) { // refresh if less than 1 minute remains
//         console.log('Refreshing token...');
//         await refreshToken();
//     } else {
//         console.log(`Token is still valid for ${Math.floor(timeLeft)} seconds.`);
//     }
// }

// setInterval(ensureTokenIsValid, 5000); // check every 5 seconds
