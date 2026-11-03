// Round 269's prompts: Osseous Sticktwister's "each opponent may sacrifice a nonland permanent of their choice or discard
// a card. Then ~ deals damage equal to its power to each opponent who didn't" (a punisher with a damage button), Sanctuary
// Warden's "you may remove a counter from a creature or planeswalker you control. If you do, ..." (yes, then the permanent
// picked), Ravenous Rotbelly's "you may sacrifice up to three Zombies" (none to three picked).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Osseous Sticktwister at Ana's end step: you take damage equal to its power rather than sacrifice or discard", async ({ page }) => {
  const s0 = scene({ hand: ["Shock"], board: ["Grizzly Bears"] }, [{ board: ["Osseous Sticktwister"], yard: ["Forest", "Hill Giant", "Shock", "Divination"] }]);
  const bears = one(s0, "Grizzly Bears");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const [life, ana] = [s.players[0]!.life, s.players[1]!.life];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("sacrifice a nonland permanent or discard a card, or take damage equal to Osseous Sticktwister's power?");
  await expect(bar.getByRole("button", { name: "Sacrifice a nonland permanent" })).toHaveCount(1);
  await expect(bar.getByRole("button", { name: "Discard a card" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Take damage equal to Osseous Sticktwister's power" }).click();
  const after = await resolveUntil(page, (st) => st.players[0]!.life === life - 2);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.players[0]!.hand.length).toBe(1);
  // Lifelink: Ana gains 2 for each opponent who took the damage.
  expect(after.players[1]!.life).toBeGreaterThanOrEqual(ana + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Sanctuary Warden: yes, then pick Grizzly Bears to lose its -1/-1 counter; draw a card and make a Citizen", async ({ page }) => {
  const s = scene({ hand: ["Sanctuary Warden"], board: [...LANDS, "Grizzly Bears"] });
  const [warden, bears] = [one(s, "Sanctuary Warden"), one(s, "Grizzly Bears")];
  s.objects[bears]!.counters = { "-1/-1": 1 };
  await open(page, s);
  await card(page, "Sanctuary Warden", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Remove a counter from a creature or planeswalker you control?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await expect(bar).toContainText("click a creature or planeswalker you control to remove a counter from it");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[bears]!.counters["-1/-1"] ?? 0) === 0);
  expect(after.objects[warden]!.counters.shield).toBe(2);
  expect(after.players[0]!.hand.length).toBe(1);
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]?.name === "Citizen Token")).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Ravenous Rotbelly: sacrifice two Zombies; Ana, with two creatures, sacrifices both", async ({ page }) => {
  const s = scene({ hand: ["Ravenous Rotbelly"], board: [...LANDS, "Walking Corpse", "Scathe Zombies"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [corpse, scathe, rotbelly, bears, giant] = [one(s, "Walking Corpse"), one(s, "Scathe Zombies"), one(s, "Ravenous Rotbelly"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Ravenous Rotbelly", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Sacrifice none" })).toBeVisible();
  await page.locator(`[data-obj="${corpse}"]`).click();
  await page.locator(`[data-obj="${scathe}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect([after.objects[corpse]!.zone, after.objects[scathe]!.zone, after.objects[rotbelly]!.zone, after.objects[bears]!.zone]).toEqual(["graveyard", "graveyard", "battlefield", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
