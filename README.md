# Compounder

Live site:

- https://compounder-hazel.vercel.app

Compounder is a local-first routines and streaks product built around privacy, consistency, and simple daily usefulness. The idea is straightforward: if a habit is meant to compound, the tool tracking it should not get in the way.

Each routine keeps its own completion history, current streak, best streak, and recent-window consistency so you can see what is actually building over time.

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

## Why it exists

This project reflects a product instinct I trust:

- local-first by default
- no account creation when it is unnecessary
- clear value from the first minute
- software that tries to earn repeat usage instead of manufacturing it

## Notes

- Data is stored locally in the browser, so it is currently device-specific.
- Existing `compounders:routines:v1` local storage data is migrated into the newer app shape automatically.
