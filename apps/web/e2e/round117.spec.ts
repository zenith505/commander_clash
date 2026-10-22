// Round 117's prompts: Druid of Purification ("starting with you, each player may choose an artifact or enchantment you
// don't control": a button for each, and "Choose nothing"), Odric, Master Tactician (you choose the defending
// player's blocks: click their creatures, then your attackers), Armored Skyhunter (you may attach the Equipment it
// put onto the battlefield to a creature you control), Protean Hulk (a library search with a total mana value limit) and
// Currency Converter (pick one of the cards exiled with it).
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, planCast, waitingOn } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Druid of Purification: choose an artifact you don't control, or nothing; each one chosen is destroyed", async ({ page }) => {
  const s = scene({ hand: ["Druid of Purification"], board: [...LANDS, "Mind Stone"] }, [{ board: ["Sol Ring"] }, { board: ["Grizzly Bears"] }]);
  const ring = idsOf(s, "Sol Ring", "battlefield", 1)[0]!;
  const mine = idsOf(s, "Mind Stone", "battlefield", 0)[0]!;
  await open(page, s);
  await card(page, "Druid of Purification", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Druid of Purification: choose an artifact or enchantment you don't control");
  await expect(bar.getByRole("button", { name: "Choose nothing" })).toBeVisible();
  // Your own Mind Stone isn't one of the choices.
  await expect(bar.getByRole("button", { name: /Mind Stone/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Sol Ring (Ana)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[ring]!.zone).toBe("graveyard");
  expect(after.objects[mine]!.zone).toBe("battlefield");
  expect(after.log.some((l) => l.text === "You chose Sol Ring (Ana).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Odric, Master Tactician: with three others attacking, you choose how Ana blocks", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Odric, Master Tactician", "Hill Giant", "Llanowar Elves", "Serra Angel"] }, [{ board: ["Grizzly Bears"] }]);
  const [odric, giant, elves, angel] = ["Odric, Master Tactician", "Hill Giant", "Llanowar Elves", "Serra Angel"].map((n) => one(s, n)) as [string, string, string, string];
  const bears = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  // The attack and Odric's trigger are played in the engine; the test starts as blockers are declared.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [odric, giant, elves, angel].map((attacker) => ({ attacker, defender: 1 })) });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers");
  expect(s.pending).toMatchObject({ player: 0, defender: 1 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("You choose Ana's blocks: click one of their untapped creatures, then the attacker it blocks.");
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(bar).toContainText("Now click the attacker Grizzly Bears blocks.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Block with 1" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[bears]!.blocking !== undefined);
  expect(after.objects[bears]!.blocking).toEqual([giant]);
  expect(after.log.some((l) => l.text === "Grizzly Bears blocks Hill Giant (You chose).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Armored Skyhunter: an Equipment from the top six, then you may attach it to a creature you control", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Armored Skyhunter", "Grizzly Bears"], library: ["Forest", "Bonesplitter", "Forest"] }, [{}]);
  const [sky, bears, saw] = [one(s, "Armored Skyhunter"), one(s, "Grizzly Bears"), one(s, "Bonesplitter")];
  // The attack and the look at the top six are played in the engine; the test starts at the attach question.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: sky, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "searchLibrary");
  s = applyAction(s, { type: "searchLibrary", player: 0, found: [saw] });
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Armored Skyhunter: choose a creature you control to attach Bonesplitter to, or none");
  await expect(bar.getByRole("button", { name: "Don't attach it" })).toBeVisible();
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => st.objects[saw]!.attachedTo !== undefined);
  expect(after.objects[saw]!.attachedTo).toBe(bears);
  expect(after.log.some((l) => l.text === "Bonesplitter is attached to Grizzly Bears.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Protean Hulk: search for creature cards with total mana value 6 or less", async ({ page }) => {
  let s = scene({ hand: ["Doom Blade"], board: [...LANDS, "Protean Hulk"], library: ["Hill Giant", "Llanowar Elves", "Grizzly Bears", "Serra Angel"] });
  const [hulk, giant, elves, bears] = ["Protean Hulk", "Hill Giant", "Llanowar Elves", "Grizzly Bears"].map((n) => one(s, n)) as [string, string, string, string];
  // Destroying the Hulk is played in the engine; the test starts at the search.
  s = playUntil(s, (st) => st.step === "main1" && waitingOn(st) === 0 && !st.pending);
  for (const a of planCast(s, 0, one(s, "Doom Blade"), [{ kind: "object", id: hulk }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "searchLibrary");
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("any number of creature cards with total mana value 6 or less");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${elves}"]`).click();
  await expect(pick).toContainText("total mana value 5 of at most 6");
  // Grizzly Bears would make it 7.
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Currency Converter: pick a card exiled with it to put into the graveyard; a land makes a Treasure", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Currency Converter"], library: ["Grizzly Bears", "Forest"] });
  const conv = one(s, "Currency Converter");
  const [bears, forest] = [idsOf(s, "Grizzly Bears", "library", 0)[0]!, s.players[0]!.library[1]!];
  // Two loots in the engine, each discarding the card drawn and exiling it with the Converter.
  s = playUntil(s, (st) => st.step === "main1" && waitingOn(st) === 0 && !st.pending);
  for (const id of [bears, forest]) {
    s.objects[conv]!.tapped = false;
    for (const a of planActivate(s, 0, conv, 0)!) s = applyAction(s, a);
    s = playUntil(s, (st) => st.pending?.kind === "discard" || st.pending?.kind === "chooseMay");
    if (s.pending?.kind === "discard") s = applyAction(s, { type: "discard", player: 0, objectIds: [id] });
    s = playUntil(s, (st) => st.pending?.kind === "chooseMay");
    s = applyAction(s, { type: "chooseMay", player: 0, yes: true });
    s = playUntil(s, (st) => st.stack.length === 0 && !st.pending);
  }
  s.objects[conv]!.tapped = false;
  expect(s.objects[forest]!.zone).toBe("exile");
  await open(page, s);
  await card(page, "Currency Converter", s).click();
  await menu(page).locator("button", { hasText: "Put a card exiled with" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("a card exiled with Currency Converter");
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[forest]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.battlefield.some((id) => after.cards[after.objects[id]!.cardId]!.name === "Treasure Token")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
