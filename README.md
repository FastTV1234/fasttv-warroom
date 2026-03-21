# Fast TV War Room — Deployment Guide

## What this is
A real-time shared intelligence OS for the Fast TV content team.
All data (tasks, pipeline, launches) syncs live across every team member's browser via WebSocket.

---

## Deploy on Railway (free, ~5 minutes)

### Step 1 — Create a GitHub repo
1. Go to github.com → New repository
2. Name it `fasttv-warroom` → Create
3. Upload all files from this folder (drag & drop in GitHub's UI)
   - server.js
   - package.json
   - railway.toml
   - public/index.html

### Step 2 — Deploy on Railway
1. Go to railway.app → Sign up / Log in (free tier works fine)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `fasttv-warroom` repo
4. Railway auto-detects Node.js and deploys
5. Click **Generate Domain** in the Settings tab
6. You get a URL like: `https://fasttv-warroom-production.up.railway.app`

### Step 3 — Share with your team
Send that URL to everyone. That's it.
- Every person who opens the URL is in the same live war room
- Tasks, pipeline moves, and launch logs sync in real time to everyone
- Data persists in `data.json` on the server — survives restarts

---

## Local development (test before deploying)

```bash
npm install
node server.js
```
Open http://localhost:3000 in multiple browser tabs to test real-time sync.

---

## How data is stored
- All data lives in `data.json` on the server
- Auto-created on first run with seed data
- Survives server restarts
- For production with large teams, consider upgrading to a proper DB (MongoDB Atlas free tier)

---

## Updating the war room
Edit `public/index.html` for UI changes.
Edit `server.js` for data logic changes.
Push to GitHub → Railway auto-redeploys in ~60 seconds.
