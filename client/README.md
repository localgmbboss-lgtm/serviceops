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
- Admin/Customer poll every 5s; map shows fresh (≤60s) vs stale (>60s).

## Accepted Flow
Create job → Assign → OnTheWay → Arrived → Completed.
Completed jobs are locked (API + UI).

## Deploy
- API: Render (Node 22), env: PORT, MONGO_URI, CORS_ORIGIN (add your client URL).
- DB: MongoDB Atlas (Network Access: allow server egress IP).
- Client: Netlify (build: `npm run build`, publish `client/build`), set `REACT_APP_API_URL` to API URL.
