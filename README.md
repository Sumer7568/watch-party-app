# Elevance streaming platform

React + Express implementation of the requested streaming, membership, comment moderation and watch-party experience.

## Run locally

1. Copy `.env.example` to `backend/.env` and set `MONGO_URI` and `JWT_SECRET`.
2. In separate terminals run:

   ```powershell
   cd backend
   npm install
   npm run dev
   ```

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

3. Open `http://localhost:5173`.

Click **Continue with submission demo** to review every UI flow without service credentials. Full registration uses MongoDB and OTP providers. Email, SMS, Razorpay and translation use safe development fallbacks until their environment credentials are supplied.

## Implemented behavior

- Unicode comments with exact user city, translate action, likes/dislikes, special-character validation and removal at two unique dislikes.
- One download per IST calendar day on Free; unlimited downloads on paid plans; saved profile Downloads page.
- Free (5 min), Bronze ₹10 (7 min), Silver ₹50 (10 min), Gold ₹100 (unlimited) limits, Razorpay order verification and invoice email.
- South India email OTP and other-region mobile OTP routing; time/region-driven light or dark experience API.
- Custom video gestures: center play/pause, side double-tap seek, and triple-tap actions.
- WebRTC peer-to-peer video calling with built-in room signaling, browser-tab screen sharing and local WebM recording.

## Browser constraints

A website cannot close a tab that it did not open. The right-side triple tap therefore shows an explanatory message. Screen capture always requires the user to choose and approve the YouTube tab in the browser picker. The included signaling works for the running server; internet-scale calling should additionally use a persistent signaling store and TURN server.

## Submission test flow

1. Open the app and use submission demo, or register and verify the prefilled development OTP.
2. Post comments in multiple languages, select a target language, and test moderation with two dislikes.
3. Download one video, then confirm the second Free download opens the plan selector.
4. Upgrade a plan through Razorpay test mode or the development fallback.
5. Test player tap gestures and open room `8F2K` in two browser tabs for a WebRTC call.
6. Share a YouTube tab and use Record; the browser saves a WebM recording locally.
