// Round 321's prompts: Anzrag's Rampage's creature card from among the exiled cards, Eivor, Wolf-Kissed's Saga card and
// land card from among the milled ones, Hand of Vecna's choice between the equipped creature and Vecna, and Jace,
// Architect of Thought's −8: a search of each player's library, then the exiled cards cast for free.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, invalidateCharacteristics, planActivate, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

/** In the engine: bots answer their prompts and everyone passes, until `done`; your attack is `attacks`. */
function botsUntil(s: GameState, done: (s: GameState) => boolean, attacks: { attacker: string; defender: number }[] = []): GameState {
  for (let i = 0; i < 400 && !done(s); i++) {
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: pid, attacks: pid === 0 ? attacks : [] });
    else if (pend?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: pid, blocks: [] });
    else s = applyAction(s, pid === 0 && !pend ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(done(s)).toBe(true);
  return s;
}

test("Anzrag's Rampage: two artifacts destroyed, two cards exiled, and you pick the creature card to put onto the battlefield", async ({ page }) => {
  let s = scene({ hand: ["Anzrag's Rampage"], board: LANDS, library: ["Forest", "Hill Giant"] }, [{ board: ["Sol Ring"] }, { board: ["Mind Stone"] }]);
  const giant = one(s, "Hill Giant");
  for (const a of planCast(s, 0, one(s, "Anzrag's Rampage"))!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(s.objects[giant]!.zone).toBe("exile");
  await open(page, s);
  const box = modal(page);
  await expect(box).toContainText("Hill Giant");
  await box.locator(`[data-pick="${giant}"]`).click();
  await box.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Eivor, Wolf-Kissed: seven cards milled, then you pick a Saga card and a land card to put onto the battlefield", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Eivor, Wolf-Kissed"], library: ["The Eldest Reborn", "Wastes", "Grizzly Bears"] });
  const [eivor, saga, wastes] = [one(s, "Eivor, Wolf-Kissed"), one(s, "The Eldest Reborn"), one(s, "Wastes")];
  s = botsUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0, [{ attacker: eivor, defender: 1 }]);
  expect(s.pending).toMatchObject({ what: "a Saga card" });
  await open(page, s);
  const box = modal(page);
  await expect(box).toContainText("Saga card");
  await box.locator(`[data-pick="${saga}"]`).click();
  await box.getByRole("button", { name: "Done" }).click();
  const land = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.what === "a land card");
  expect(land.objects[saga]!.zone).toBe("graveyard");
  await expect(box).toContainText("land card");
  await box.locator(`[data-pick="${wastes}"]`).click();
  await box.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.objects[saga]!.zone === "battlefield" && x.objects[wastes]!.zone === "battlefield");
  expect(after.objects[one(after, "Grizzly Bears")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Hand of Vecna: at the beginning of combat you click Vecna rather than the equipped creature to get +X/+X", async ({ page }) => {
  let s = scene({ hand: ["Grizzly Bears", "Hill Giant"], board: [...LANDS, "Hand of Vecna", "Craw Wurm", "Grizzly Bears"] }, [], { step: "upkeep" });
  const hand = one(s, "Hand of Vecna");
  const wurm = one(s, "Craw Wurm");
  // A creature named Vecna (Book of Vile Darkness's token): a Grizzly Bears renamed.
  const vecna = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!;
  const bearsDef = s.cards[s.objects[vecna]!.cardId]!;
  s.cards["test:vecna"] = { ...bearsDef, oracleId: "test:vecna", name: "Vecna" };
  s.objects[vecna]!.cardId = "test:vecna";
  s.objects[hand]!.attachedTo = wurm;
  invalidateCharacteristics(s);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.player === 0);
  const n = s.players[0]!.hand.length;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose the creature that gets the bonus");
  await expect(bar.getByRole("button", { name: "Craw Wurm", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Vecna", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.effects.some((e) => e.affected?.includes(vecna)));
  expect(after.effects.some((e) => e.affected?.includes(wurm))).toBe(false);
  expect(n).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Jace, Architect of Thought −8: you search each library in turn, then cast a card exiled from Ana's library for free", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Jace, Architect of Thought"], library: ["Hill Giant"] }, [{ library: ["Divination"] }, { library: ["Grizzly Bears"] }, {}]);
  const jace = one(s, "Jace, Architect of Thought");
  s.objects[jace]!.counters.loyalty = 8;
  const [giant, div, bears] = [one(s, "Hill Giant"), one(s, "Divination"), one(s, "Grizzly Bears")];
  const idx = 2;
  for (const a of planActivate(s, 0, jace, idx)!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  await open(page, s);
  const box = modal(page);
  // Your library, then Ana's, Ben's and Cy's (nothing to take from Cy's: lands only).
  for (const pick of [giant, div, bears]) {
    await expect(box.locator(`[data-pick="${pick}"]`)).toBeVisible();
    await box.locator(`[data-pick="${pick}"]`).click();
    await box.getByRole("button", { name: "Done" }).click();
    if (pick !== bears) await resolveUntil(page, (x) => x.objects[pick]!.zone === "exile" && x.pending?.kind === "searchLibrary");
  }
  const offer = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong");
  expect([giant, div, bears].map((id) => offer.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Divination", exact: true }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong" && !x.pending.options.includes(div));
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.objects[div]!.zone === "graveyard");
  expect(after.objects[div]!.owner).toBe(1);
  expect([giant, bears].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});
