# ServiceOps (MERN)

## Run locally
1) Server
   cd server
   cp .env.sample .env
   # set MONGO_URI
   npm i
   npm run seed
   npm run dev

2) Client
   cd client
   cp .env.sample .env
   npm i
   npm start

## Live Map
- Driver toggles "Share live location" on /driver.
- Admin/Customer poll every 5s; map shows fresh (60s) vs stale (>60s).

## Accepted Flow
Create job -> Assign -> OnTheWay -> Arrived -> Completed.
Completed jobs are locked (API + UI).

## In-app messaging
- Customers can chat with their assigned vendor directly on the status page.
- Vendors see the same conversation inside the Vendor App when an assigned job is expanded.
- Messages support up to 6 vehicle photos per send (PNG, JPG, WEBP, GIF, HEIC).

## Deploy
- API: Render (Node 22), env: PORT, MONGO_URI, CORS_ORIGIN (add your client URL).
- DB: MongoDB Atlas (Network Access: allow server egress IP).
- Client: Netlify (build: `npm run build`, publish `client/build`), set `REACT_APP_API_URL` to API URL.

## Mobile (Capacitor)
1. Build the web assets: `npm run build`
2. Copy into native shells: `npm run cap:sync`
3. Open Android Studio: `npm run cap:open:android` (requires Android SDK/Studio)
4. On macOS you can set up iOS with `npm run cap:open:ios` after installing Xcode

Capacitor is configured in `capacitor.config.json` (app id `com.serviceops.app`, web dir `build`). Adjust `server` settings there if you need live reload or a different scheme.
