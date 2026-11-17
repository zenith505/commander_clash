// Lane B round B246 in the browser: Lagrella, the Magpie's targets (any number, controlled by different players) and,
// when two of your cards return at once, the choice of the one its delayed trigger is about (CR 603.7b); Sentinel of Lost
// Lore's modes and its targets in exile; Cloudspire Coordinator's Pilots.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Lagrella: exile your Grizzly Bears and Ana's Llanowar Elves (not her Hill Giant too); Murder it and the Bears come back with two +1/+1 counters", async ({ page }) => {
  const s = scene({ hand: ["Lagrella, the Magpie", "Murder"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Llanowar Elves", "Hill Giant"] }]);
  const [lagrella, bears, elves, giant] = [one(s, "Lagrella, the Magpie"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Lagrella, the Magpie", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("controlled by a different player");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${elves}"]`).first().click();
  // Ana already has a target: her Hill Giant can't be one too.
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const done = bar.getByRole("button", { name: "Done" });
  if (await done.count()) await done.click();
  const mid = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile");
  expect(mid.objects[elves]!.zone).toBe("exile");
  expect(mid.objects[giant]!.zone).toBe("battlefield");
  await card(page, "Murder", mid).click();
  await page.locator(`[data-obj="${lagrella}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[lagrella]!.zone === "graveyard" && (st.objects[bears]!.counters["+1/+1"] ?? 0) === 2);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(after.objects[elves]!.controller).toBe(1);
  expect(after.objects[elves]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Lagrella: your Bears and your Elves that Ana controls return at once; you choose the Elves for the counters", async ({ page }) => {
  const s = scene({ hand: ["Lagrella, the Magpie", "Murder"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves"] });
  const [lagrella, bears, elves] = [one(s, "Lagrella, the Magpie"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  // Yours, controlled by Ana.
  s.objects[elves]!.controller = 1;
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Lagrella, the Magpie", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const bar = page.locator(".targeting");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${elves}"]`).first().click();
  const done = bar.getByRole("button", { name: "Done" });
  if (await done.count()) await done.click();
  const mid = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile" && st.objects[elves]!.zone === "exile");
  await card(page, "Murder", mid).click();
  await page.locator(`[data-obj="${lagrella}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "triggerSubject" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Lagrella, the Magpie: choose the card its ability is about (put two +1/+1 counters on it)");
  await controls(page).getByRole("button", { name: "Llanowar Elves" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[elves]!.counters["+1/+1"] ?? 0) === 2);
  expect(after.objects[elves]!.controller).toBe(0);
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Sentinel of Lost Lore: all three modes; your Bonecrusher Giant from exile to your hand, Ana's to the bottom of her library, Ben's graveyard exiled", async ({ page }) => {
  const s = scene({ hand: ["Sentinel of Lost Lore"], board: LANDS, exile: ["Bonecrusher Giant // Stomp", "Hill Giant"] }, [{ exile: ["Bonecrusher Giant // Stomp"] }, { yard: ["Grizzly Bears"] }]);
  const mine = idsOf(s, "Bonecrusher Giant", "exile", 0)[0]!;
  const theirs = idsOf(s, "Bonecrusher Giant", "exile", 1)[0]!;
  const hill = one(s, "Hill Giant");
  const yard = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Sentinel of Lost Lore", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0);
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Return target card you own in exile/ }).click();
  await modes.getByRole("button", { name: /Put target card you don't own in exile/ }).click();
  await modes.getByRole("button", { name: /Exile target player's graveyard/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  // Your exiled adventurer card: not your Hill Giant (no Adventure), nor Ana's.
  const first = modal(page);
  await expect(first.locator(`[data-pick="${hill}"]`)).toHaveCount(0);
  await expect(first.locator(`[data-pick="${theirs}"]`)).toHaveCount(0);
  await first.locator(`[data-pick="${mine}"]`).click();
  const second = modal(page);
  await expect(second.locator(`[data-pick="${mine}"]`)).toHaveCount(0);
  await second.locator(`[data-pick="${theirs}"]`).click();
  await page.locator(`[data-player="2"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mine]!.zone === "hand");
  expect(after.objects[theirs]!.zone).toBe("library");
  expect(after.players[1]!.library.at(-1)).toBe(theirs);
  expect(after.objects[yard]!.zone).toBe("exile");
  expect(after.objects[hill]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Cloudspire Coordinator: cast Bulwark Ox and Colossal Plow, then tap it for two Pilots", async ({ page }) => {
  const s = scene({ hand: ["Bulwark Ox", "Colossal Plow"], board: [...LANDS, "Cloudspire Coordinator"] });
  const [coord, ox, plow] = [one(s, "Cloudspire Coordinator"), one(s, "Bulwark Ox"), one(s, "Colossal Plow")];
  await open(page, s);
  await card(page, "Bulwark Ox", s).click();
  const mid = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ox]!.zone === "battlefield");
  await card(page, "Colossal Plow", mid).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[plow]!.zone === "battlefield");
  await page.locator(`[data-obj="${coord}"]`).first().click();
  await menu(page).getByRole("button", { name: /Create X 1\/1 colorless Pilot/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[coord]!.tapped);
  const pilots = after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0 && /Pilot/.test(after.cards[after.objects[id]!.cardId]!.name));
  expect(pilots.length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
