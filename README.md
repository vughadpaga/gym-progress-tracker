[README.md](https://github.com/user-attachments/files/32151324/README.md)
# Gym Progress Tracker 🏋️

A simple workout tracker for logging sets, following your progress, and keeping different gym routines organized.

## Try it out

**[Open the Gym Progress Tracker](https://gym-progress-tracker.navy-toast-4848.chatgpt.site)**

Sign in with Google and your workouts will stay private and synced across your devices.

## What it can do

- Log your weight and reps for each set
- Compare each set with the matching set from your last workout
- View progress with dated line-and-dot charts
- Keep separate exercise libraries for different gyms
- Move exercises and their history between gym locations
- See completed workouts on a calendar
- Schedule future workouts
- Add it to your phone's Home Screen

## Your workout data

The code is stored in this repository, but workout data is not. Exercises, sets, schedules, and history are stored privately in Firebase and are connected to each person's Google account.

## Running it locally

You'll need Node.js 22.13 or newer. Then run:

```bash
npm ci
npm run dev
```

Open the local address shown in the terminal.

Google sign-in only works on domains added under **Firebase Authentication → Settings → Authorized domains**.

## Main files

- `app/page.tsx` — the tracker and its main features
- `app/globals.css` — styling and mobile layout
- `app/firebase.ts` — Google sign-in and Firebase connection
- `app/cloud.ts` — cloud saving and loading
- `firestore.rules` — privacy rules for workout data
- `public/icons` — app and Home Screen icons

## Quick heads-up

Uploading a new version to GitHub does not automatically update the current `chatgpt.site` app. The website and this repository are separate unless an automatic deployment workflow is added later.

Made to keep gym tracking simple 💪
