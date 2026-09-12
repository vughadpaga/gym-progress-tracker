# Gym Progress Tracker

A mobile-friendly workout tracker with Google sign-in and private, per-user cloud data. The current ChatGPT Sites version is live at:

https://gym-progress-tracker.navy-toast-4848.chatgpt.site

## What the app includes

- Google account sign-in
- Private exercises, sets, schedules, and workout history for each user
- Custom gym locations with separate exercise libraries
- Exercise transfers between gyms, with optional history transfer
- Set-by-set comparisons with the previous workout
- Dated progress charts for Set 1, Set 2, or all sets
- Monthly calendar with completed and scheduled workout days
- Installable mobile icon and web-app manifest

## Important storage details

This repository contains the application source code, but it does **not** contain anyone's workout records. Workout data remains in the Firebase/Firestore project `gym-progress-tracker-27fab` and is loaded after the user signs in with Google.

The Firebase configuration in `app/firebase.ts` is a normal browser configuration, not a private server key. Never commit a Firebase service-account file, OAuth client secret, password, or private key.

The Firestore database used by this app is named `default` (without parentheses). Keep this line unchanged unless the database is intentionally changed:

```ts
export const db = getFirestore(app, "default");
```

## Run locally

Requirements:

- Node.js 22.13 or newer
- npm

Install and start the development server:

```bash
npm ci
npm run dev
```

Then open the local address printed in the terminal. For Google sign-in to work on a new domain, add that domain in Firebase Console under **Authentication > Settings > Authorized domains**.

## Build and verify

```bash
npm test
```

The project also provides:

```bash
npm run build
npm run validate:artifact
```

## Firebase setup that must remain enabled

In Firebase project `gym-progress-tracker-27fab`:

1. **Authentication > Sign-in method > Google** must remain enabled.
2. Every hosted app domain must be listed under **Authentication > Settings > Authorized domains**.
3. The Firestore rules in `firestore.rules` must be published to the `default` database.

The rules restrict each signed-in user to their own path under `users/{userId}`.

## Main files

- `app/page.tsx` — tracker interface, workout logic, gym management, calendar, and charts
- `app/firebase.ts` — Firebase app, Google authentication, and named Firestore connection
- `app/cloud.ts` — Firestore read/write helpers
- `app/globals.css` — responsive styling
- `firestore.rules` — per-user database security rules
- `public/icons/` — Home Screen and installable-app icons
- `public/manifest.webmanifest` — app installation metadata
- `.openai/hosting.json` — connection to the existing ChatGPT Sites project

## Future editing workflow

1. Clone or download this repository.
2. Make and test the requested changes.
3. Commit and push the updated code to GitHub.
4. Deploy the updated commit to the chosen host.

Pushing to GitHub alone does not update the current `chatgpt.site` deployment. The existing Sites project and a GitHub copy are separate until a deployment workflow is configured.

If this repository is given to a developer or an AI assistant in the future, point them to this README and ask them to preserve the Firebase project, the named `default` Firestore database, its security rules, and the existing user-data paths.
