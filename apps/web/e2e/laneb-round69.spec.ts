// Lane B round 69: two instances of conspire, each its own pick (CR 702.78b); a draw shield or Underrealm Lich, the
// drawing player's choice (CR 616.1); "Remove X +1/+1 counters from among creatures you control" (Retribution of the Ancients).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("two Raiding Schemes: the conspire bar asks again for the second instance, and each paid instance is a copy", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Raiding Schemes", "Raiding Schemes", "Raging Goblin", "Goblin Piker", "Hill Giant", "Gray Ogre"] });
  const [raging, piker, giant, ogre] = [one(s, "Raging Goblin"), one(s, "Goblin Piker"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 1);
  const bar = page.locator(".targeting", { hasText: "conspire" });
  await expect(bar).toContainText("(2 instances)");
  await page.locator(`[data-obj="${raging}"]`).click();
  await page.locator(`[data-obj="${piker}"]`).click();
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  // The second instance: two more creatures.
  const again = page.locator(".targeting", { hasText: "conspire again" });
  await expect(again).toContainText("instance 2 of 2");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${ogre}"]`).click();
  await again.getByRole("button", { name: "Tap and cast" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await clickPlayer(page, 2);
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await clickPlayer(page, 3);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([after.players[1]!.life, after.players[2]!.life, after.players[3]!.life]).toEqual([37, 37, 37]);
  expect([raging, piker, giant, ogre].every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("two Raiding Schemes: skipping the second instance casts it with one copy", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Raiding Schemes", "Raiding Schemes", "Raging Goblin", "Goblin Piker", "Hill Giant", "Gray Ogre"] });
  const [raging, piker, giant] = [one(s, "Raging Goblin"), one(s, "Goblin Piker"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 1);
  const bar = page.locator(".targeting", { hasText: "conspire" });
  await page.locator(`[data-obj="${raging}"]`).click();
  await page.locator(`[data-obj="${piker}"]`).click();
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  const again = page.locator(".targeting", { hasText: "conspire again" });
  await expect(again).toBeVisible();
  await again.getByRole("button", { name: "Cast without" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([after.players[1]!.life, after.players[2]!.life, after.players[3]!.life]).toEqual([37, 37, 40]);
  expect(after.objects[giant]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("a Words shield and Underrealm Lich: you choose which replaces the draw; the shield waits for the next one", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Underrealm Lich"], library: ["Goblin Piker", "Hill Giant", "Grizzly Bears", "Craw Wurm", "Llanowar Elves", "Lightning Bolt"] });
  s.players[0]!.nextDrawInstead = [{ turn: s.turn, source: "Words of Wilding", token: { name: "Bear", power: 2, toughness: 2, colors: ["G"], types: ["Creature"], subtypes: ["Bear"], keywords: [] } }];
  await open(page, s);
  await card(page, "Divination", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  expect(asked.pending).toMatchObject({ kind: "drawInstead", left: 1 });
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw:");
  await expect(bar.getByRole("button", { name: "Create a 2/2 Bear token (Words of Wilding)" })).toHaveCount(1);
  await bar.getByRole("button", { name: /Look at the top 3 cards instead.*Underrealm Lich/ }).click();
  // The Lich's look: one to the hand, the rest to the graveyard.
  await resolveUntil(page, (st) => st.pending?.kind === "drawLook");
  await bar.getByRole("button", { name: "Hill Giant to hand", exact: true }).click();
  // The second draw: the shield or the Lich again; the Bear this time.
  await resolveUntil(page, (st) => st.pending?.kind === "drawInstead");
  await bar.getByRole("button", { name: "Create a 2/2 Bear token (Words of Wilding)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const names = (ids: string[]) => ids.map((id) => after.cards[after.objects[id]!.cardId]!.name);
  expect(names(after.players[0]!.hand)).toEqual(["Hill Giant"]);
  expect(names(after.players[0]!.graveyard).sort()).toEqual(["Divination", "Goblin Piker", "Grizzly Bears"]);
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken && after.cards[after.objects[id]!.cardId]!.name.startsWith("Bear"))).toHaveLength(1);
  expect(after.players[0]!.nextDrawInstead).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Retribution of the Ancients: choose X, pick X +1/+1 counters from among your creatures, the target gets -X/-X", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Retribution of the Ancients", "Grizzly Bears", "Hill Giant"] }, [{ board: ["Gray Ogre"] }]);
  const [retribution, bears, giant, ogre] = [one(s, "Retribution of the Ancients"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  s.objects[bears]!.counters["+1/+1"] = 1;
  s.objects[giant]!.counters["+1/+1"] = 2;
  await open(page, s);
  await page.locator(`[data-obj="${retribution}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "-X/-X" });
  if (await item.count()) await item.click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("remove X +1/+1 counters from among creatures you control");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await page.locator(`[data-obj="${ogre}"]`).click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("0 of 2 chosen");
  await pick.locator(`[data-counter="${bears}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  await pick.locator(`[data-counter="${giant}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  await expect(pick).toContainText("2 of 2 chosen");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ogre]!.zone === "graveyard");
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
