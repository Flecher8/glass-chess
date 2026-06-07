# Glass Chess

Glass Chess is a browser-only chess analysis web app built with Next.js, TypeScript, React, CSS Modules, and local Stockfish analysis.

The MVP is designed for static export and Vercel deployment. It does not use a custom backend, API routes, server actions, database, authentication, analytics, tracking cookies, or server-side Stockfish.

## Features

- Home, analysis, privacy, terms, licenses, and not found pages
- Responsive dark glass interface using plain CSS
- PGN import and FEN import
- Legal move validation with `chess.js`
- Manual board moves with move navigation
- Browser-based Stockfish.js v18 lite single-thread analysis
- Evaluation, best move, and principal variation display
- Full-game review with progress, cancellation, and estimated move classifications

## Requirements

- Node.js 20.9 or newer
- npm

This project currently uses npm. Do not switch package managers unless the project is deliberately migrated.

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Next.js, usually:

```txt
http://localhost:3000
```

## Validate

Run the checks before treating changes as complete:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

The build uses Next.js static export and writes static output to `out/`.

## Static Deployment

The app is configured with:

```ts
output: "export"
```

The MVP must remain compatible with static hosting. Do not add API routes, route handlers, middleware, server actions, server-side sessions, database calls, or server-side engine execution.

For SEO URLs, set `NEXT_PUBLIC_SITE_URL` during build if deploying to a custom domain. Without it, the app uses the default Vercel-style project URL in metadata and sitemap output.

## Stockfish Notice

This application uses Stockfish, a GPL v3 chess engine. Stockfish runs locally in the browser for analysis.

Bundled Stockfish files are stored in:

```txt
public/vendor/stockfish/18/
```

The bundled engine files are unmodified Stockfish.js v18 lite single-thread browser files. The GPL v3 license text is included at `public/vendor/stockfish/18/Copying.txt`.

## Privacy Model

Imported PGN and FEN data is processed in the browser. The MVP does not include accounts, backend game storage, analytics, tracking cookies, payment logic, or database persistence.

Browser local storage may be used for non-sensitive preferences such as board orientation and engine settings.
