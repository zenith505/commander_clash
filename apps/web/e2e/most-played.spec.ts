// Prompts from the most played Commander cards: Rhystic Study's pay-or-they-draw bar, Arcane Denial's "draw up to two
// cards" buttons, Deflecting Swat's new targets (CR 115.7d), Myriad Landscape's "basic land cards that share a land
// type", and Command Beacon's choice between two commanders.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Rhystic Study: the bar says the bot may draw unless you pay {1}", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: LANDS }, [{ board: ["Rhystic Study"] }]);
  const ana = s.players[1]!.hand.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Rhystic Study:");
  await expect(controls(page)).toContainText("or Ana may draw a card.");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.hand.length).toBe(ana);
  expect(pageErrors(page)).toEqual([]);
});

test("Arcane Denial: at the next upkeep, buttons to draw two, one or none", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Arcane Denial"], board: LANDS });
  const [divination, denial] = [one(s, "Divination"), one(s, "Arcane Denial")];
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Arcane Denial", s).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[denial]!.zone === "graveyard");
  const resolved = await state(page);
  expect(resolved.objects[divination]!.zone).toBe("graveyard");
  // On to the next upkeep in the engine (for speed).
  await open(page, playUntil(resolved, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "drawUpTo" && x.pending.player === 0));
  // Both spells left the hand; both of Arcane Denial's draws are yours.
  const hand = s.players[0]!.hand.length - 2;
  const bar = controls(page);
  await expect(bar).toContainText("draw up to 2 cards?");
  await expect(bar.getByRole("button")).toHaveText(["Draw 2 cards", "Draw 1 card", "Draw none"]);
  await bar.getByRole("button", { name: "Draw 2 cards" }).click();
  // Two from Arcane Denial's first ability, one from its second.
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.triggerQueue.length === 0 && x.players[0]!.hand.length >= hand + 3, 200);
  expect(after.step).toBe("upkeep");
  expect(after.players[0]!.hand.length).toBe(hand + 3);
  expect(pageErrors(page)).toEqual([]);
});

test("Deflecting Swat: free with a commander, then click the spell's new target", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt", "Deflecting Swat"], board: [...LANDS, "Hill Giant", "Krosan Cloudscraper"] }, [{ board: ["Grizzly Bears"] }]);
  const [giant, bears, cmdr] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), idsOf(s, "Krosan Cloudscraper", "command", 0)[0]!];
  // Your commander on the battlefield, so the Swat is free.
  const board = idsOf(s, "Krosan Cloudscraper", "battlefield", 0)[0]!;
  s.objects[board]!.isCommander = true;
  s.players[0]!.command = s.players[0]!.command.filter((id) => id !== cmdr);
  s.objects[cmdr]!.zone = "exile";
  s.players[0]!.exile.push(cmdr);
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  const before = await state(page);
  const untapped = before.battlefield.filter((id) => before.objects[id]!.controller === 0 && !before.objects[id]!.tapped).length;
  await card(page, "Deflecting Swat", s).click();
  await menu(page).getByRole("button", { name: /without paying its mana cost/ }).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "newTargets");
  const now = await state(page);
  expect(now.battlefield.filter((id) => now.objects[id]!.controller === 0 && !now.objects[id]!.tapped).length).toBe(untapped);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("Deflecting Swat: new targets for Lightning Bolt");
  await expect(bar.getByRole("button", { name: /^Keep target/ })).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Myriad Landscape: up to two basic lands, and only ones that share a land type", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Myriad Landscape"], library: ["Forest", "Island", "Island"] });
  const landscape = one(s, "Myriad Landscape");
  s.objects[landscape]!.tapped = false;
  const onBoard = (st: typeof s, name: string) => st.battlefield.filter((id) => st.objects[id]!.controller === 0 && st.cards[st.objects[id]!.cardId]!.name === name).length;
  await open(page, s);
  await card(page, "Myriad Landscape", s).click();
  await menu(page).locator("button", { hasText: "Search your library" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("They must share a land type.");
  // The cards come grouped by name: an Island, then a Forest isn't offered, then another Island.
  const island = pick.locator("[data-pick]", { hasText: "Island" });
  await expect(island).toHaveClass(/targetable/);
  await island.click();
  await expect(island).toContainText("×9");
  await expect(pick.locator("[data-pick].dim", { hasText: "Forest" })).toHaveCount(1);
  await island.click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(onBoard(after, "Island")).toBe(onBoard(s, "Island") + 2);
  expect(onBoard(after, "Forest")).toBe(onBoard(s, "Forest"));
  expect(pageErrors(page)).toEqual([]);
});

test("Command Beacon: with two commanders in the command zone, a button for each", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Command Beacon"], library: ["Sylvia Brightspear"] });
  const sylvia = one(s, "Sylvia Brightspear");
  // A second commander (partners), in the command zone.
  s.players[0]!.library = s.players[0]!.library.filter((id) => id !== sylvia);
  s.objects[sylvia]!.zone = "command";
  s.objects[sylvia]!.isCommander = true;
  s.players[0]!.command.push(sylvia);
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Command Beacon", s).click();
  await menu(page).locator("button", { hasText: "Put your commander into your hand" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "commander");
  const bar = controls(page);
  await expect(bar).toContainText("put which commander into your hand?");
  await expect(bar.getByRole("button")).toHaveText(["Krosan Cloudscraper", "Sylvia Brightspear"]);
  await bar.getByRole("button", { name: "Sylvia Brightspear" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[sylvia]!.zone).toBe("hand");
  expect(after.players[0]!.command).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});
