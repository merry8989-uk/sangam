# Sangam for Android

The Android client, built with Expo (React Native). It talks to the same
backend as the web app - no separate API.

## What is in it

| Screen | Route | Backend call |
| --- | --- | --- |
| Feed | `app/index.tsx` | `GET /api/posts` |
| Shorts | `app/shorts.tsx` | `GET /api/posts?type=SHORT` |
| Explore | `app/explore.tsx` | `GET /api/posts?type=VIDEO` |
| Post detail | `app/post/[id].tsx` | `GET /api/posts/:id` |
| Messages | `app/messages.tsx` | `GET /api/dm` |
| AI chat | `app/ai.tsx` | `POST /api/ai/chat` |
| Settings | `app/settings.tsx` | `GET /api/settings` |
| Sign in | `app/login.tsx` | `POST /api/mobile/login` |

The theme engine (`src/theme.ts`) is the same 480-theme system as the web app,
so a user's rotation and mood-driven theme match across devices.

## Sign-in

The web app signs in with NextAuth session cookies. React Native cannot reuse
those, so the app posts to `/api/mobile/login` and stores a Bearer token.
Every API route accepts either the cookie or the token, so both clients work
against one backend.

Set `MOBILE_TOKEN_SECRET` on the server (falls back to `NEXTAUTH_SECRET`).

## Run it in development

```bash
cd apps/mobile
npm install
cp .env.example .env          # set EXPO_PUBLIC_API_URL
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone, or press `a` to open an
Android emulator.

`EXPO_PUBLIC_API_URL` must point at your backend:

- Android emulator: `http://10.0.2.2:3000` (the emulator's alias for your machine)
- Real phone on the same Wi-Fi: `http://<your-lan-ip>:3000`

## Build an APK

The easiest route needs no Android SDK on your machine - EAS builds it in the
cloud:

```bash
npm install -g eas-cli
eas login                       # free Expo account
eas build -p android --profile preview
```

`preview` produces a shareable **APK**. `production` produces an **AAB** for the
Play Store.

Prefer to build locally? You need Android Studio (or the Android SDK + JDK 17):

```bash
npx expo prebuild -p android    # generates the android/ project
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

## Notes

- Media is served from the backend at `/api/media/<key>`; the app loads
  thumbnails and posters from there.
- Video playback uses `expo-video` (HLS). Wire it into `post/[id].tsx` when you
  want inline playback.
- Direct messages currently refresh on open; live updates need an SSE or
  WebSocket client, which is not wired up yet.
