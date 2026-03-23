# Compounders

Compounders is a local-first Next.js app for tracking routines you want to keep on a daily, weekly, or monthly cadence. Each routine keeps its own completion history, current streak, best streak, and recent-window consistency so you can see what is compounding over time.

## What it does

- Create routines with a title, cadence, and intention
- Track daily, weekly, and monthly completions
- Calculate current streaks and best streaks
- Highlight routines that are complete, due, or off-track
- Filter by cadence, status, and search query
- Edit, archive, restore, and delete routines
- Export and import data as JSON
- Persist everything in browser local storage

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If port `3000` is busy, Next.js will automatically choose another local port and print it in the terminal.

## Tech

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4

## Notes

- Data is stored locally in the browser, so it is currently device-specific.
- Existing `compounders:routines:v1` local storage data is migrated into the newer app shape automatically.
