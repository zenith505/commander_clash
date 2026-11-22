// Round 445: Flamewar, Brash Veteran (its menu: sacrifice Sol Ring to put a +1/+1 counter on it and convert it; "{1},
// Discard your hand" puts the exiled cards you own with intel counters into your hand) and Cosima, God of the Voyage // The
// Omenkeel (Yes at your upkeep exiles Cosima; each land you play then asks for a voyage counter, No returns it with that
// many +1/+1 counters and draws that many; The Omenkeel's combat damage exiles Ana's top cards and you play her Forest).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, controls, menu, modal, passTo, resolveUntil, seat } from "./ui";

const FLAMEWAR = "Flamewar, Brash Veteran // Flamewar, Streetwise Operative";
const COSIMA = "Cosima, God of the Voyage // The Omenkeel";

test("Flamewar, Brash Veteran: sacrifice Sol Ring from its menu; it gets a +1/+1 counter and converts", async ({ page }) => {
  const s = scene({ board: [...LANDS, FLAMEWAR, "Sol Ring"] });
  const [flamewar, ring] = [one(s, "Flamewar, Brash Veteran"), one(s, "Sol Ring")];
  await open(page, s);
  await page.locator(`[data-obj="${flamewar}"]`).click();
  await menu(page).locator("button", { hasText: "Put a +1/+1 counter on" }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("sacrifice another artifact");
  await page.locator(`[data-obj="${ring}"]`).click();
  await costBar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[flamewar]!.face === 1);
  expect(after.objects[ring]!.zone).toBe("graveyard");
  expect(after.objects[flamewar]!.counters["+1/+1"]).toBe(1);
  expect(after.log.some((l) => /Flamewar, Streetwise Operative/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Flamewar, Brash Veteran: {1}, Discard your hand puts your face-down cards with intel counters into your hand", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: [...LANDS, FLAMEWAR], exile: ["Lightning Bolt", "Grizzly Bears", "Llanowar Elves"] });
  const [flamewar, giant, bolt, bears, elves] = [one(s, "Flamewar, Brash Veteran"), one(s, "Hill Giant"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  for (const id of [bolt, bears]) {
    s.objects[id]!.counters = { intel: 1 };
    s.objects[id]!.hiddenExile = { by: flamewar, seen: [], label: "Face down" };
  }
  await open(page, s);
  await page.locator(`[data-obj="${flamewar}"]`).click();
  await menu(page).locator("button", { hasText: "Put all exiled cards you own with intel counters" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "hand");
  expect([giant, bolt, bears, elves].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "hand", "hand", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Cosima, God of the Voyage: Yes at your upkeep exiles it; the Forest you play then asks for a voyage counter, Yes", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, COSIMA], hand: ["Forest"] });
  const cosima = one(s0, "Cosima, God of the Voyage");
  const forest = idsOf(s0, "Forest", "hand", 0)[0]!;
  // Through the opponents' turns to your next upkeep, in the engine (for speed).
  await open(page, playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0));
  const bar = controls(page);
  await expect(bar).toContainText("Exile Cosima, God of the Voyage");
  await bar.getByRole("button", { name: "Yes" }).click();
  const exiled = await resolveUntil(page, (st) => st.objects[cosima]!.zone === "exile" && st.stack.length === 0 && !st.pending);
  expect(exiled.objects[cosima]!.gainedInExile?.zc).toBe(exiled.objects[cosima]!.zoneChanges);
  await passTo(page, "main1");
  await page.locator(`[data-obj="${forest}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(bar).toContainText("Put a voyage counter on Cosima, God of the Voyage");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[cosima]!.counters.voyage ?? 0) === 1);
  expect(after.objects[cosima]!.zone).toBe("exile");
  expect(after.objects[forest]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Cosima, God of the Voyage: with two voyage counters, No returns it with two +1/+1 counters and you draw two", async ({ page }) => {
  const s: GameState = scene({ board: LANDS, hand: ["Forest"], exile: [COSIMA] });
  const cosima = one(s, "Cosima, God of the Voyage");
  const forest = idsOf(s, "Forest", "hand", 0)[0]!;
  const o = s.objects[cosima]!;
  o.counters = { voyage: 2 };
  o.gainedInExile = { zc: o.zoneChanges ?? 0, texts: ["Whenever a land you control enters, if ~ is exiled, you may put a voyage counter on it. If you don't, return ~ to the battlefield with X +1/+1 counters on it and draw X cards, where X is the number of voyage counters on it."] };
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${forest}"]`).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const hand = asked.players[0]!.hand.length;
  const bar = controls(page);
  await expect(bar).toContainText("If you don't, Cosima, God of the Voyage returns to the battlefield with 2 +1/+1 counters and you draw 2 cards.");
  await bar.getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[cosima]!.zone === "battlefield");
  expect(after.objects[cosima]!.counters).toEqual({ "+1/+1": 2 });
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("The Omenkeel: its combat damage exiles Ana's top three cards; you play her Forest, not her Grizzly Bears", async ({ page }) => {
  const s: GameState = scene({ board: [...LANDS, COSIMA] }, [{ library: ["Forest", "Grizzly Bears", "Island"] }]);
  const keel = one(s, "Cosima, God of the Voyage");
  const [forest, bears] = [s.players[1]!.library[0]!, s.players[1]!.library[1]!];
  expect([forest, bears].map((id) => s.cards[s.objects[id]!.cardId]!.name)).toEqual(["Forest", "Grizzly Bears"]);
  s.objects[keel]!.face = 1;
  // Crewed: an artifact creature until end of turn.
  s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: 0, sourceName: "test", duration: "endOfTurn", affected: [keel], mods: [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }] });
  invalidateCharacteristics(s);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0, 60);
  await attack(page, [[keel, 1]]);
  const main2 = await passTo(page, "main2");
  expect(main2.players[1]!.life).toBe(37);
  expect([forest, bears].map((id) => main2.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(main2.objects[forest]!.mayPlay).toMatchObject({ player: 0, landOnly: true });
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  await expect(modal(page).locator(".card.playable")).toHaveCount(2);
  await modal(page).locator(".card.playable", { hasText: "Forest" }).click();
  const play = menu(page).getByRole("button", { name: /^Play it/ });
  if (await play.count()) await play.first().click();
  const after = await resolveUntil(page, (st) => st.objects[forest]!.zone === "battlefield");
  expect(after.objects[forest]!.controller).toBe(0);
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
