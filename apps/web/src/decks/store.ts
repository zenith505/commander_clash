// Where saved decks live. `DeckStore` is the one interface the app uses; the backend behind it can change (this
// device's browser storage now, an account on a server later) without touching the deck builder.

import type { SavedDeck } from "@cc/engine";

export interface Account {
  id: string;
  /** What the app shows for the signed-in player. */
  name: string;
}

export interface DeckStore {
  /** "device": saved in this browser only. */
  kind: "device" | "account";
  account(): Account | null;
  listDecks(): Promise<SavedDeck[]>;
  saveDeck(deck: SavedDeck): Promise<SavedDeck>;
  deleteDeck(id: string): Promise<void>;
}

const KEY = "cc.decks.v1";

function readAll(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(decks: SavedDeck[]) {
  localStorage.setItem(KEY, JSON.stringify(decks));
}

/** Decks kept in this browser's storage. */
export const deviceStore: DeckStore = {
  kind: "device",
  account: () => null,
  listDecks: async () => readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  saveDeck: async (deck) => {
    const saved = { ...deck, updatedAt: new Date().toISOString() };
    writeAll([saved, ...readAll().filter((d) => d.id !== deck.id)]);
    return saved;
  },
  deleteDeck: async (id) => writeAll(readAll().filter((d) => d.id !== id)),
};

export function newDeckId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
