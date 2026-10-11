# Commander Clash

A 4-player Commander (Magic: The Gathering) game: you against three bots.

```
packages/engine   Pure TypeScript rules engine. No UI, no I/O. Fully unit tested.
apps/web          React + Vite game client that drives the engine.
tools/            Card-data build script and a bot-vs-bot simulator.
data/raw/         Scryfall bulk files and the Comprehensive Rules PDF (not in git).
data/generated/   cards.json, rulings.json, sample-decks.json (built, not in git).
docs/PLAN.md      Architecture and roadmap.
```

## Run it

Needs [Node.js](https://nodejs.org) 22 or newer.

```
npm install
npm run dev          # open the URL it prints (http://localhost:5173)
```

The sample decks the game uses are already in `apps/web/public/data/`, so this works
before you build any card data.

## Card data

Put the Scryfall bulk files in `data/raw/` and run:

```
npm run build:cards
```

It picks the newest `unique-artwork-*.jsonl` (or `default-cards`/`all-cards`) and
`rulings-*.jsonl` in `data/raw/`, writes `data/generated/`, and regenerates the sample
decks. Takes about 10 seconds on unique-artwork; the 3 GB all-cards file is streamed.

## Other commands

```
npm test             # engine unit tests
npm run typecheck
npm run simulate     # bots play full games, prints speed and winners
```
