// The deck builder: search the card pool in Scryfall's syntax, choose a commander (its color identity then filters the
// search), add cards, read the deck's statistics, import or export a deck list, and save the deck.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  canPair,
  choosesColor,
  commanderCandidate,
  deckIdentity,
  deckLimit,
  deckStats,
  fitsIdentity,
  formatDeckList,
  parseCardQuery,
  parseDeckList,
  resolveDeckList,
  savedDeckProblems,
  searchCards,
  COLORS,
  type CardDef,
  type Color,
  type SavedDeck,
} from "@cc/engine";
import { ManaCost, Pip, RulesText } from "../Mana";
import { DeckStats } from "./DeckStats";
import { smallImage, type CardPool } from "./pool";
import { newDeckId, type DeckStore } from "./store";

const PAGE = 60;
const TYPE_GROUPS = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];
const groupOf = (d: CardDef) => {
  const ts = (d.faces?.[0] ?? d).types;
  return TYPE_GROUPS.find((t) => ts.includes(t)) ?? "Other";
};

export function emptyDeck(): SavedDeck {
  return { id: newDeckId(), name: "", cards: [], updatedAt: "" };
}

type Pane = "search" | "deck" | "stats";

export function DeckBuilder({ pool, store, initial, startWithImport, onDone }: { pool: CardPool; store: DeckStore; initial: SavedDeck; startWithImport?: boolean; onDone: () => void }) {
  const [deck, setDeck] = useState<SavedDeck>(initial);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [onlyIdentity, setOnlyIdentity] = useState(true);
  const [detail, setDetail] = useState<CardDef | null>(null);
  const [pane, setPane] = useState<Pane>("search");
  const [deckView, setDeckView] = useState<"images" | "list">("images");
  const [importing, setImporting] = useState(!!startWithImport);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  // Typing is debounced so a 30,000-card search doesn't run on every key.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(typed);
      setShown(PAGE);
    }, 180);
    return () => clearTimeout(t);
  }, [typed]);

  const change = (f: (d: SavedDeck) => SavedDeck) => {
    setDeck(f);
    setDirty(true);
    setStatus(null);
  };

  const commander = deck.commander ? pool.lookup(deck.commander) : undefined;
  const second = deck.secondCommander ? pool.lookup(deck.secondCommander) : undefined;
  const commanders = [commander, second].filter((c): c is CardDef => !!c);
  const identity = deckIdentity(commanders, [deck.commanderColor, deck.secondCommanderColor]);
  const cardDefs = useMemo(() => deck.cards.map((n) => pool.lookup(n)).filter((d): d is CardDef => !!d), [deck.cards, pool]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of deck.cards) m.set(n, (m.get(n) ?? 0) + 1);
    return m;
  }, [deck.cards]);
  const total = deck.cards.length + commanders.length;

  const parsed = useMemo(() => parseCardQuery(query), [query]);
  const filterIdentity = onlyIdentity && commanders.length > 0;
  const results = useMemo(() => {
    const cards = filterIdentity ? pool.cards.filter((d) => fitsIdentity(d, identity)) : pool.cards;
    return searchCards(cards, parsed);
    // identity is a new Set each render: its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, pool, filterIdentity, [...identity].join("")]);

  const stats = useMemo(() => deckStats(commanders, cardDefs), [commanders.map((c) => c.name).join("|"), cardDefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const problems = useMemo(() => savedDeckProblems(deck, pool.lookup), [deck, pool]);

  const canAdd = (d: CardDef) => (counts.get(d.name) ?? 0) < deckLimit(d) && d.name !== deck.commander && d.name !== deck.secondCommander;
  const add = (d: CardDef) => canAdd(d) && change((x) => ({ ...x, cards: [...x.cards, d.name] }));
  const removeOne = (name: string) =>
    change((x) => {
      const i = x.cards.lastIndexOf(name);
      return i < 0 ? x : { ...x, cards: [...x.cards.slice(0, i), ...x.cards.slice(i + 1)] };
    });
  const setCommander = (d: CardDef) =>
    change((x) => ({
      ...x,
      commander: d.name,
      commanderColor: undefined,
      // A second commander that can't partner with the new one is dropped.
      ...(x.secondCommander && pool.lookup(x.secondCommander) && canPair(d, pool.lookup(x.secondCommander)!) ? {} : { secondCommander: undefined, secondCommanderColor: undefined }),
      cards: x.cards.filter((n) => n !== d.name),
      name: x.name || d.name.split(" // ")[0]!,
    }));
  const setSecond = (d: CardDef) => change((x) => ({ ...x, secondCommander: d.name, secondCommanderColor: undefined, cards: x.cards.filter((n) => n !== d.name) }));
  const clearCommander = (which: "first" | "second") =>
    change((x) =>
      which === "second" || !x.secondCommander
        ? { ...x, ...(which === "second" ? { secondCommander: undefined, secondCommanderColor: undefined } : { commander: undefined, commanderColor: undefined }) }
        : { ...x, commander: x.secondCommander, commanderColor: x.secondCommanderColor, secondCommander: undefined, secondCommanderColor: undefined },
    );

  const save = async () => {
    const named = { ...deck, name: deck.name.trim() || (commander ? commander.name.split(" // ")[0]! : "New deck") };
    try {
      const saved = await store.saveDeck(named);
      setDeck(saved);
      setDirty(false);
      setStatus(`Saved "${saved.name}"${store.kind === "device" ? " on this device" : ""}.`);
    } catch (e) {
      setStatus(`Couldn't save: ${(e as Error).message}`);
    }
  };

  const groups = useMemo(() => {
    const g = new Map<string, { d: CardDef; n: number }[]>();
    for (const [name, n] of counts) {
      const d = pool.lookup(name);
      if (!d) continue;
      const k = groupOf(d);
      (g.get(k) ?? g.set(k, []).get(k)!).push({ d, n });
    }
    for (const list of g.values()) list.sort((a, b) => a.d.cmc - b.d.cmc || a.d.name.localeCompare(b.d.name));
    return [...TYPE_GROUPS, "Other"].filter((t) => g.has(t)).map((t) => ({ type: t, cards: g.get(t)! }));
  }, [counts, pool]);
  const missing = deck.cards.filter((n) => !pool.lookup(n));

  return (
    <div className="builder">
      <header className="builder-head">
        <button className="ghost" onClick={onDone} data-testid="builder-back">
          ← Menu
        </button>
        <input className="deck-name" aria-label="Deck name" placeholder={commander ? commander.name.split(" // ")[0] : "Deck name"} value={deck.name} onChange={(e) => change((x) => ({ ...x, name: e.target.value }))} />
        <span className={`deck-count ${total === 100 ? "ok" : ""}`} data-testid="deck-count">
          {total} / 100
        </span>
        <button className="ghost" onClick={() => setImporting(true)}>
          Import list
        </button>
        <button className="ghost" onClick={() => setExporting(true)} disabled={!total}>
          Export
        </button>
        <button onClick={save} data-testid="save-deck">
          {dirty || !deck.updatedAt ? "Save deck" : "Saved"}
        </button>
        {status && (
          <span className="builder-status" role="status">
            {status}
          </span>
        )}
      </header>

      <nav className="builder-tabs" aria-label="Deck builder sections">
        {(["search", "deck", "stats"] as Pane[]).map((p) => (
          <button key={p} className={pane === p ? "" : "ghost"} onClick={() => setPane(p)} data-tab={p}>
            {p === "search" ? "Search" : p === "deck" ? `Deck (${total})` : "Stats"}
          </button>
        ))}
      </nav>

      <div className={`builder-body pane-${pane}`}>
        <section className="builder-search">
          <div className="search-row">
            <input
              type="search"
              className="card-search"
              aria-label="Search cards"
              placeholder='Search, e.g. t:creature mv<=3 o:"draw a card"'
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setQuery(typed);
                  setShown(PAGE);
                }
              }}
              data-testid="card-search"
            />
            <button className="ghost" onClick={() => setHelp(!help)} aria-expanded={help}>
              Syntax
            </button>
          </div>
          {help && <SearchHelp />}
          <div className="search-meta">
            <span data-testid="result-count">
              {results.length.toLocaleString()} card{results.length === 1 ? "" : "s"}
            </span>
            {commanders.length > 0 && (
              <label className="identity-toggle">
                <input type="checkbox" checked={onlyIdentity} onChange={(e) => setOnlyIdentity(e.target.checked)} data-testid="identity-filter" />
                Only {identityLabel(identity)} cards
                <span className="identity-pips">{[...identity].length ? COLORS.filter((c) => identity.has(c)).map((c) => <Pip key={c} sym={c} size="sm" />) : <Pip sym="C" size="sm" />}</span>
              </label>
            )}
            {!commanders.length && <span className="muted small">Pick a commander (search is:commander) to filter by its colors.</span>}
          </div>
          {parsed.problems.length > 0 && (
            <ul className="search-problems" data-testid="search-problems">
              {parsed.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <div className="card-grid">
            {results.slice(0, shown).map((d) => (
              <CardTile key={d.oracleId} d={d} count={counts.get(d.name) ?? 0} isCommander={d.name === deck.commander || d.name === deck.secondCommander} onOpen={() => setDetail(d)} onAdd={canAdd(d) ? () => add(d) : undefined} />
            ))}
          </div>
          {results.length > shown && (
            <button className="ghost more" onClick={() => setShown(shown + PAGE)}>
              Show more ({(results.length - shown).toLocaleString()} left)
            </button>
          )}
        </section>

        <section className="builder-deck">
          <div className="commander-slots">
            {commanders.length === 0 && <div className="commander-empty muted">No commander yet. Open a legendary creature from the search and choose “Make commander”.</div>}
            {commanders.map((c, i) => (
              <div key={c.name} className="commander-slot" data-testid={i === 0 ? "commander" : "second-commander"}>
                <img src={c.imageUrl} alt={c.name} onClick={() => setDetail(c)} />
                <div className="commander-info">
                  <div className="small muted">{i === 0 ? "Commander" : "Second commander"}</div>
                  <div className="commander-name">{c.name}</div>
                  {choosesColor(c) && (
                    <label className="small">
                      Color chosen for it:{" "}
                      <select
                        value={(i === 0 ? deck.commanderColor : deck.secondCommanderColor) ?? ""}
                        onChange={(e) => change((x) => ({ ...x, [i === 0 ? "commanderColor" : "secondCommanderColor"]: (e.target.value || undefined) as Color | undefined }))}
                      >
                        <option value="">choose…</option>
                        {COLORS.map((col) => (
                          <option key={col} value={col}>
                            {COLOR_WORD[col]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button className="ghost small-btn" onClick={() => clearCommander(i === 0 ? "first" : "second")}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {problems.length > 0 ? (
            <details className="deck-problems" data-testid="deck-problems">
              <summary>
                {problems.length} thing{problems.length === 1 ? "" : "s"} to fix before it can be played
              </summary>
              <ul>
                {problems.slice(0, 30).map((p, i) => (
                  <li key={i}>{p.card ? `${p.card}: ${p.problem}` : p.problem}</li>
                ))}
              </ul>
            </details>
          ) : (
            <div className="deck-ready" data-testid="deck-ready">
              Ready to play.
            </div>
          )}
          {missing.length > 0 && <p className="error small">Not in this game's cards: {[...new Set(missing)].join(", ")}</p>}

          <div className="deck-view-toggle">
            <button className={deckView === "images" ? "" : "ghost"} onClick={() => setDeckView("images")}>
              Images
            </button>
            <button className={deckView === "list" ? "" : "ghost"} onClick={() => setDeckView("list")}>
              List
            </button>
          </div>
          {groups.map((g) => (
            <div key={g.type} className="deck-group">
              <h4>
                {g.type} ({g.cards.reduce((n, c) => n + c.n, 0)})
              </h4>
              {deckView === "images" ? (
                <div className="card-grid deck-grid">
                  {g.cards.map(({ d, n }) => (
                    <div key={d.name} className="deck-card" data-deck-card={d.name}>
                      <img src={smallImage(d.imageUrl)} alt={d.name} loading="lazy" onClick={() => setDetail(d)} />
                      {n > 1 && <span className="count-badge">×{n}</span>}
                      <div className="deck-card-btns">
                        <button className="ghost small-btn" onClick={() => removeOne(d.name)} aria-label={`Remove one ${d.name}`}>
                          −
                        </button>
                        {deckLimit(d) > 1 && (
                          <button className="ghost small-btn" onClick={() => add(d)} aria-label={`Add another ${d.name}`}>
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="deck-lines">
                  {g.cards.map(({ d, n }) => (
                    <li key={d.name} data-deck-line={d.name}>
                      <span className="line-count">{n}</span>
                      <button className="link" onClick={() => setDetail(d)}>
                        {d.name}
                      </button>
                      <ManaCost cost={(d.faces?.[0] ?? d).manaCost} size="sm" />
                      <button className="ghost small-btn" onClick={() => removeOne(d.name)} aria-label={`Remove one ${d.name}`}>
                        −
                      </button>
                      {deckLimit(d) > 1 && (
                        <button className="ghost small-btn" onClick={() => add(d)} aria-label={`Add another ${d.name}`}>
                          +
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {!deck.cards.length && <p className="muted">The deck is empty. Add cards from the search, or import a deck list.</p>}
        </section>

        <section className="builder-stats">
          <DeckStats stats={stats} />
        </section>
      </div>

      {detail && (
        <CardDetail
          d={detail}
          count={counts.get(detail.name) ?? 0}
          inIdentity={!commanders.length || fitsIdentity(detail, identity)}
          isCommander={detail.name === deck.commander || detail.name === deck.secondCommander}
          canAdd={canAdd(detail)}
          canCommand={commanderCandidate(detail) && detail.name !== deck.commander}
          canSecond={!!commander && !second && canPair(commander, detail)}
          onAdd={() => add(detail)}
          onRemove={() => removeOne(detail.name)}
          onCommander={() => {
            setCommander(detail);
            setDetail(null);
          }}
          onSecond={() => {
            setSecond(detail);
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      )}
      {importing && (
        <ImportDialog
          pool={pool}
          onCancel={() => setImporting(false)}
          onImport={(next) => {
            change((x) => ({ ...x, ...next, name: x.name || next.name || "" }));
            setImporting(false);
            setPane("deck");
          }}
        />
      )}
      {exporting && <ExportDialog text={formatDeckList(commanders.map((c) => c.name), deck.cards)} onClose={() => setExporting(false)} />}
    </div>
  );
}

const COLOR_WORD: Record<Color, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

function identityLabel(id: Set<Color>): string {
  const cs = COLORS.filter((c) => id.has(c));
  if (!cs.length) return "colorless";
  if (cs.length === 5) return "five-color";
  return cs.map((c) => COLOR_WORD[c].toLowerCase()).join("-");
}

function CardTile({ d, count, isCommander, onOpen, onAdd }: { d: CardDef; count: number; isCommander: boolean; onOpen: () => void; onAdd?: () => void }) {
  return (
    <div className={`card-tile ${count || isCommander ? "in-deck" : ""}`} data-result={d.name}>
      <button className="tile-image" onClick={onOpen} title={d.name}>
        {d.imageUrl ? <img src={smallImage(d.imageUrl)} alt={d.name} loading="lazy" /> : <span className="tile-name">{d.name}</span>}
      </button>
      <div className="tile-foot">
        <span className="tile-label">{isCommander ? "Commander" : count ? `In deck${count > 1 ? ` ×${count}` : ""}` : ""}</span>
        <button className="small-btn" onClick={onAdd} disabled={!onAdd} aria-label={`Add ${d.name}`} data-add={d.name}>
          + Add
        </button>
      </div>
    </div>
  );
}

function CardDetail(props: {
  d: CardDef;
  count: number;
  inIdentity: boolean;
  isCommander: boolean;
  canAdd: boolean;
  canCommand: boolean;
  canSecond: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onCommander: () => void;
  onSecond: () => void;
  onClose: () => void;
}) {
  const { d } = props;
  const [face, setFace] = useState(0);
  const faces = d.faces?.length ? d.faces : [d];
  const f = faces[face] ?? d;
  const img = (d.faces?.[face] as { imageUrl?: string } | undefined)?.imageUrl ?? d.imageUrl;
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", key);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", key);
  }, [d]);
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="card-detail" role="dialog" aria-label={d.name} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()} data-testid="card-detail">
        <img src={img} alt={f.name} />
        <div className="card-detail-text">
          <div className="oracle-head">
            <strong>{f.name}</strong>
            <ManaCost cost={f.manaCost} />
          </div>
          <div className="muted">{f.typeLine}</div>
          <RulesText text={f.oracleText} />
          {f.power !== undefined && (
            <div className="big-pt">
              {f.power}/{f.toughness}
            </div>
          )}
          {f.loyalty !== undefined && <div className="big-pt">Loyalty {f.loyalty}</div>}
          {faces.length > 1 && (
            <button className="ghost small-btn" onClick={() => setFace((face + 1) % faces.length)}>
              Show other face
            </button>
          )}
          {!props.inIdentity && <p className="error small">Outside your commander's color identity.</p>}
          <div className="detail-actions">
            {props.isCommander ? (
              <span className="muted">Your commander</span>
            ) : (
              <>
                <button onClick={props.onAdd} disabled={!props.canAdd} data-testid="detail-add">
                  {props.count ? `Add another (${props.count} in deck)` : "Add to deck"}
                </button>
                {props.count > 0 && (
                  <button className="ghost" onClick={props.onRemove}>
                    Remove one
                  </button>
                )}
              </>
            )}
            {props.canCommand && (
              <button className="ghost" onClick={props.onCommander} data-testid="make-commander">
                Make commander
              </button>
            )}
            {props.canSecond && (
              <button className="ghost" onClick={props.onSecond} data-testid="make-second-commander">
                Make second commander
              </button>
            )}
            <button className="ghost" onClick={props.onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportDialog({ pool, onImport, onCancel }: { pool: CardPool; onImport: (d: Partial<SavedDeck> & { cards: string[] }) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const resolved = useMemo(() => (text.trim() ? resolveDeckList(parseDeckList(text), pool.lookup) : null), [text, pool]);
  // No commander section: the list's own commander candidates to pick from (Moxfield's plain export lists it with the rest).
  const [picked, setPicked] = useState<string | null>(null);
  const candidates = resolved && !resolved.commanders.length ? [...new Set(resolved.cards.filter(commanderCandidate).map((c) => c.name))] : [];
  const commanders = resolved?.commanders.length ? resolved.commanders.map((c) => c.name) : picked ? [picked] : [];
  const doImport = () => {
    if (!resolved) return;
    let cards = resolved.cards.map((c) => c.name);
    if (picked && !resolved.commanders.length) {
      const i = cards.indexOf(picked);
      if (i >= 0) cards = [...cards.slice(0, i), ...cards.slice(i + 1)];
    }
    onImport({ commander: commanders[0], secondCommander: commanders[1], commanderColor: undefined, secondCommanderColor: undefined, cards, ...(commanders[0] ? { name: commanders[0].split(" // ")[0] } : {}) });
  };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="import-dialog" role="dialog" aria-label="Import a deck list" onClick={(e) => e.stopPropagation()} data-testid="import-dialog">
        <h3>Import a deck list</h3>
        <p className="muted small">Paste a list from Moxfield, Archidekt, MTG Arena or any “1 Card Name” list. A “Commander” section (or a [Commander] tag) sets the commander. It replaces the cards in this deck.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n36 Forest"} data-testid="import-text" />
        {resolved && (
          <div className="import-summary" data-testid="import-summary">
            <div>
              {resolved.cards.length} card{resolved.cards.length === 1 ? "" : "s"}
              {resolved.commanders.length ? ` and commander ${resolved.commanders.map((c) => c.name).join(" + ")}` : ""}
              {resolved.skipped ? `, ${resolved.skipped} sideboard/maybeboard left out` : ""}.
            </div>
            {resolved.unknown.length > 0 && (
              <div className="error" data-testid="import-unknown">
                Not found or not supported yet: {resolved.unknown.map((u) => u.name).join(", ")}
              </div>
            )}
            {!resolved.commanders.length && candidates.length > 0 && (
              <div className="import-pick">
                Which is the commander?{" "}
                {candidates.slice(0, 12).map((n) => (
                  <button key={n} className={picked === n ? "small-btn" : "ghost small-btn"} onClick={() => setPicked(picked === n ? null : n)} data-pick-commander={n}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="detail-actions">
          <button onClick={doImport} disabled={!resolved || (!resolved.cards.length && !resolved.commanders.length)} data-testid="import-confirm">
            Import
          </button>
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="import-dialog" role="dialog" aria-label="Export deck list" onClick={(e) => e.stopPropagation()}>
        <h3>Deck list</h3>
        <textarea readOnly value={text} rows={16} data-testid="export-text" />
        <div className="detail-actions">
          <button
            onClick={() =>
              navigator.clipboard
                ?.writeText(text)
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchHelp() {
  const rows: [string, string][] = [
    ["goblin king", "names containing both words"],
    ['!"Sol Ring"', "exactly that name"],
    ["t:creature t:elf", "type line (any face)"],
    ['o:"draw a card"  o:/^flying/', "rules text, ~ for the card's name, /regex/; fo: includes reminder text"],
    ["c:rg  c=u  c<=wu  c:m  c:c", "colors: at least / exactly / at most, multicolored, colorless"],
    ["id:esper  id<=bg", "color identity within (as for a commander)"],
    ["mv<=3  pow>=4  tou<pow  pt>=10  loy=4", "mana value, power, toughness, loyalty; mv:even"],
    ["m:{G}{G}  m:2WW", "mana symbols in the cost"],
    ["r:mythic  r>=rare  s:cmr  year>=2020", "rarity, set and year of the printing shown"],
    ["is:commander  is:gamechanger  is:mdfc  is:partner", "also spell, permanent, historic, vanilla, modal, dfc, adventure"],
    ["kw:flying  produces:g", "keyword abilities, mana it can make"],
    ["-t:land  (t:instant or t:sorcery)", "not, or, parentheses"],
    ["order:mv dir:desc", "sort: name, mv, power, toughness, rarity, color, released"],
  ];
  return (
    <table className="search-help">
      <tbody>
        {rows.map(([q, what]) => (
          <tr key={q}>
            <td>
              <code>{q}</code>
            </td>
            <td className="muted">{what}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
