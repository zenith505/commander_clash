// The main menu: your saved decks and the starter decks to play, and the way into the deck builder.
// The deck builder has its own address (#decks/new, #decks/import, #decks/<id>), so the phone's back button works.

import { useEffect, useState } from "react";
import { savedDeckProblems, type GameState, type SavedDeck } from "@cc/engine";
import { newGame, type DeckBundle } from "../useGame";
import { DeckBuilder, emptyDeck } from "./DeckBuilder";
import { bundleForSaved } from "./play";
import { loadPool, smallImage, type CardPool } from "./pool";
import { deviceStore, type DeckStore } from "./store";

/** The part of the address after `#`. */
export function useHashRoute(): string {
  const [hash, setHash] = useState(() => location.hash.replace(/^#\/?/, ""));
  useEffect(() => {
    const on = () => setHash(location.hash.replace(/^#\/?/, ""));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const go = (route: string) => {
  location.hash = route ? `#${route}` : "";
};

/** The deck store the app uses. */
export const store: DeckStore = deviceStore;

function usePool(enabled: boolean): { pool: CardPool | null; error: string | null } {
  const [pool, setPool] = useState<CardPool | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadPool()
      .then((p) => live && setPool(p))
      .catch((e) => live && setError(`Couldn't load the card pool (${(e as Error).message}). Run \`npm run build:pool\`.`));
    return () => {
      live = false;
    };
  }, [enabled]);
  return { pool, error };
}

function useSavedDecks(): SavedDeck[] | null {
  const [decks, setDecks] = useState<SavedDeck[] | null>(null);
  useEffect(() => {
    store.listDecks().then(setDecks, () => setDecks([]));
  }, []);
  return decks;
}

export function BuilderRoute({ route }: { route: string }) {
  const { pool, error } = usePool(true);
  const decks = useSavedDecks();
  const which = route.slice("decks/".length);
  if (error) return <div className="splash">{error}</div>;
  if (!pool || !decks) return <div className="splash">Loading cards…</div>;
  const existing = decks.find((d) => d.id === which);
  if (which !== "new" && which !== "import" && !existing) return <div className="splash">That deck isn't saved here.</div>;
  return <DeckBuilder key={which} pool={pool} store={store} initial={existing ?? emptyDeck()} startWithImport={which === "import"} onDone={() => go("")} />;
}

export function MainMenu({ bundle, onPlay }: { bundle: DeckBundle; onPlay: (s: GameState) => void }) {
  const decks = useSavedDecks();
  const [list, setList] = useState<SavedDeck[] | null>(null);
  useEffect(() => setList(decks), [decks]);
  // The pool is only needed for saved decks: their pictures, whether they can be played, and to play them.
  const { pool, error } = usePool(!!list?.length);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  return (
    <div className="lobby">
      <h1>Commander Clash</h1>
      <div className="menu-actions">
        <button onClick={() => go("decks/new")} data-testid="open-builder">
          Build a deck
        </button>
        <button className="ghost" onClick={() => go("decks/import")} data-testid="open-import">
          Import a deck list
        </button>
        <span className="muted small">{store.kind === "device" ? "Decks are saved on this device." : `Signed in as ${store.account()?.name}`}</span>
      </div>

      {!!list?.length && (
        <>
          <h2>Your decks</h2>
          {error && <p className="error">{error}</p>}
          <div className="deck-list">
            {list.map((d) => {
              const cmd = pool && d.commander ? pool.lookup(d.commander) : undefined;
              const problems = pool ? savedDeckProblems(d, pool.lookup) : [];
              const count = d.cards.length + (d.commander ? 1 : 0) + (d.secondCommander ? 1 : 0);
              return (
                <div key={d.id} className="saved-deck" data-saved-deck={d.name}>
                  {cmd?.artUrl || cmd?.imageUrl ? <img src={cmd.artUrl ?? smallImage(cmd.imageUrl)} alt={cmd.name} /> : <div className="saved-deck-blank" />}
                  <div className="saved-deck-name">{d.name}</div>
                  <div className="muted small">
                    {count} / 100{d.commander ? ` · ${d.commander}` : ""}
                  </div>
                  {pool && problems.length > 0 && <div className="small error">{problems[0]!.card ? `${problems[0]!.card}: ${problems[0]!.problem}` : problems[0]!.problem}</div>}
                  <div className="saved-deck-btns">
                    <button disabled={!pool || problems.length > 0} onClick={() => pool && onPlay(newGame(bundleForSaved(bundle, d, pool), 0))} data-play={d.name}>
                      Play
                    </button>
                    <button className="ghost" onClick={() => go(`decks/${d.id}`)} data-edit={d.name}>
                      Edit
                    </button>
                    {confirmDelete === d.id ? (
                      <button
                        className="ghost danger"
                        onClick={async () => {
                          await store.deleteDeck(d.id);
                          setList(list.filter((x) => x.id !== d.id));
                          setConfirmDelete(null);
                        }}
                        data-confirm-delete={d.name}
                      >
                        Really delete
                      </button>
                    ) : (
                      <button className="ghost" onClick={() => setConfirmDelete(d.id)} data-delete={d.name}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2>Starter decks</h2>
      <p>Pick a deck. The other three are played by bots.</p>
      <div className="deck-list">
        {bundle.decks.map((d, i) => {
          const cmd = bundle.cards.find((c) => c.name === d.commander);
          return (
            <button key={d.name} className="deck-choice" onClick={() => onPlay(newGame(bundle, i))}>
              {cmd?.imageUrl && <img src={cmd.imageUrl} alt={cmd.name} />}
              <span>{d.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
