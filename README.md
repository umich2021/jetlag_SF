# SF Control

A real-time mobile board game where teams compete to control San Francisco neighborhoods by depositing coins, completing challenges, and outbidding each other across the city.

Built with React Native, Expo, and Supabase.

---

fyi plz just contact me if you're going to run this, because there might be some unresolved bugs, that I definitely put off til later

## How to Play

### Roles

- **Team Captains** — log in with your team password, deposit coins into neighborhoods, complete challenges
- **Admin** — controls the game, manages coins, releases challenges, approves completions

### Gameplay

1. Teams start with a fixed coin balance
2. Captains physically travel to neighborhoods and deposit coins to claim control
3. The team with the highest total deposit in a neighborhood controls it
4. Teams can outbid each other — the max you can deposit is the current leader's total + 10 coins
5. Challenges are released by the admin throughout the game, rewarding coins on completion
6. The team controlling the most neighborhoods at the end wins

### Coin Deposit Rules

- You must be physically near a neighborhood to deposit (within ~150m)
- If you don't control a neighborhood: max deposit = leader's total + 10
- If you do control it (defending): max deposit = second place total + 10
- Coins are cumulative — deposits stack over time

### Challenge Types

- 📌 **Regular (Reg)** — fixed coin reward
- ⚡ **Variable (Var)** — reward varies based on performance
- 💀 **Steal** — steal coins from another team

### Challenge Rewards

- Base reward × global multiplier × failure bonus
- If teams fail a challenge before you, your reward increases by 50% per failed team

---

## Setup

### Requirements

- Node.js 18+
- Expo Go (iPhone players)
- Android: install the `.apk` directly from the build link

### Installation

```bash
npm install
npx expo start --tunnel
```

### Environment Variables

Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Database

- Hosted on Supabase (PostgreSQL)
- Run `supabase/schema.sql` in the Supabase SQL editor to set up all tables, views, triggers, and RLS policies

---

## Distribution

### Android

- Built with EAS Build
- Players download and install the `.apk` directly from the build link
- No app store required

### iPhone

- Players download **Expo Go** from the App Store
- Run `npx expo start --tunnel` and share the QR code
- Requires the dev server to be running during the game

---

## Known Limitations & Issues

### Performance

- Loading 50+ SF neighborhoods with polygon overlays is resource-intensive on older phones
- The map may be slow to render on low-end Android devices
- This is a known React Native Maps limitation with large polygon datasets — players should be warned the initial load may take a few seconds

### Location

- GPS accuracy varies in dense urban areas and inside buildings
- The 150m buffer around neighborhoods accounts for this, but edge cases exist
- Bus riders on neighborhood borders may or may not qualify depending on GPS drift

### iOS Maps

- iPhone players via Expo Go use Apple Maps instead of Google Maps
- Polygons and markers still work correctly, visual style differs slightly

### Real-time

- Supabase free tier has connection limits — if many players connect simultaneously there may be delays in real-time updates
- Polygon color changes after a deposit may take a few seconds to propagate

### Deposit Cap

- The deposit cap is enforced client-side — admin can bypass it via the admin panel if needed

### Coin Balance

- Coin balance updates are not atomic — in rare cases of simultaneous deposits, balance may be slightly off
- Admin can manually adjust via the Admin panel

### Web

- The app is not designed for web — `react-native-maps` does not support web
- A web mock is in place so the rest of the UI renders, but the map will be blank on web

### No Authentication

- Login is password-only with no session management
- If the app is closed and reopened, players will need to log in again
- This is intentional for simplicity given the in-person game context

---

## Admin Guide

### Accessing Admin

- On the login screen, enter password `1337` (or your set admin password)
- Admin sees 3 tabs: Map, Challenges, Admin Panel

### Map Tab

- Tap any neighborhood to see all team deposits
- View all captain locations in real time
- Challenge pins shown with type icons

### Challenges Tab

- All challenges listed with status badges (Active / Hidden / Completed)
- Tap a challenge to:
  - Hide/show the description from captain view
  - Approve completion (marks as completed, crosses it out)
  - Mark as failed (for tracking failure bonus)

### Admin Panel

- **Global Multiplier** — increase challenge rewards across the board
- **Team Coins** — manually add or subtract coins from any team
- **Place Bid** — deposit coins on behalf of a team (for fixing mistakes or code issues)

---

## Tech Stack

- **Frontend** — React Native, Expo Router, TypeScript
- **Maps** — react-native-maps (Google Maps on Android, Apple Maps on iOS)
- **Backend** — Supabase (PostgreSQL + Realtime)
- **Auth** — Plain text password matching (intentional for simplicity)
- **Build** — EAS Build for Android, Expo Go for iOS
- **Hosting** — Supabase for database, Expo for builds

---

## Database Schema

```
teams
├── id (uuid, PK)
├── name (text)
├── color (text)
├── password (text)
└── coins_balance (integer)

neighborhoods
├── id (uuid, PK)
├── name (text)
├── wkt (text)
├── controlled_by_team_id (uuid, FK → teams.id)
└── is_active (boolean)

neighborhood_deposits
├── id (uuid, PK)
├── neighborhood_id (uuid, FK → neighborhoods.id)
├── team_id (uuid, FK → teams.id)
├── coins_added (integer)
└── created_at (timestamptz)

challenges
├── id (uuid, PK)
├── display_id (text)
├── title (text)
├── description (text)
├── type (text) — fixed | variable | steal
├── base_reward (integer)
├── global_multiplier (numeric)
├── coordinate_lat (numeric)
├── coordinate_lng (numeric)
├── is_hidden (boolean)
├── is_completed (boolean)
└── completed_by_team_id (uuid, FK → teams.id)

challenge_attempts
├── id (uuid, PK)
├── challenge_id (uuid, FK → challenges.id)
├── team_id (uuid, FK → teams.id)
└── status (text) — pending | completed | failed

user_locations
├── id (uuid, PK)
├── team_id (uuid, FK → teams.id, UNIQUE)
├── latitude (numeric)
├── longitude (numeric)
└── updated_at (timestamptz)

game_settings
├── id (integer, PK) — always 1
├── global_coin_multiplier (numeric)
└── game_is_active (boolean)

── VIEWS ──────────────────────────────
neighborhood_totals
└── SUM(coins_added) per team per neighborhood

challenge_rewards
└── base_reward × global_multiplier × (1 + 0.5 × failed_count)

── TRIGGERS ───────────────────────────
on_deposit_inserted
└── after INSERT on neighborhood_deposits
    → recalculates controlled_by_team_id on neighborhoods
```

---

## Contact

Questions, bugs, or feedback — reach out at **jimsonyangbusiness@gmail.com**
