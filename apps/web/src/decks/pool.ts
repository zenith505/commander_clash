// The deck builder's card pool: every Commander-legal card the engine supports (tools/build-pool.ts writes it).

import { cardNameIndex, registerMeldResults, type CardDef } from "@cc/engine";

export interface CardPool {
  cards: CardDef[];
  /** Meld results and the cards Garth One-Eye names: part of a game's cards, never in a deck. */
  extras: CardDef[];
  lookup: (name: string) => CardDef | undefined;
}

let loading: Promise<CardPool> | null = null;

/** Loads (once) and unzips the pool. A host may already have unzipped it in transit, so the gzip header is checked. */
export function loadPool(): Promise<CardPool> {
  loading ??= (async () => {
    const r = await fetch(`${import.meta.env.BASE_URL}data/card-pool.json.gz`);
    if (!r.ok) throw new Error(`card pool: HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const text = gz ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : new TextDecoder().decode(bytes);
    const data = JSON.parse(text) as { cards: CardDef[]; extras: CardDef[] };
    registerMeldResults([...data.cards, ...data.extras]);
    return { cards: data.cards, extras: data.extras, lookup: cardNameIndex(data.cards) };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/** Scryfall's small image (146x204) for grids; the normal one (488x680) otherwise. */
export function smallImage(url: string | undefined): string | undefined {
  return url?.replace("/normal/", "/small/");
}
