// Round 160: Dream Devourer's granted foretell (the menu entry and the foretell cost it gives), Danitha's picker of an
// Aura or Equipment card from your hand or graveyard, and Star Athlete's "sacrifice it or take 5" choice.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, modal, passTo, resolveUntil, seat } from "./ui";

test("Dream Devourer: foretell Grizzly Bears from your hand, then cast it from exile for {G}", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Dream Devourer"] });
  const [bears, devourer] = [one(s, "Grizzly Bears"), one(s, "Dream Devourer")];
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  await menu(page).getByRole("button", { name: /^Foretell/ }).click();
  const now = await resolveUntil(page, (st) => st.objects[bears]!.zone === "exile" && st.stack.length === 0 && !st.pending);
  expect(now.objects[bears]).toMatchObject({ foretold: true, mayPlay: { until: "foretell", foretellReduce: 2 } });
  // Its "whenever you foretell a card" trigger: +2/+0.
  expect(now.log.some((l) => /Dream Devourer gets \+2\/\+0/.test(l.text))).toBe(true);
  // On your next turn, without Dream Devourer, it still has the foretell cost it was given (rulings).
  const later = playUntil(now, (st) => st.step === "main1" && st.activePlayer === 0 && st.turn === s.turn + 4 && !st.stack.length && !st.pending);
  later.battlefield.splice(later.battlefield.indexOf(devourer), 1);
  later.objects[devourer]!.zone = "graveyard";
  later.players[0]!.graveyard.push(devourer);
  await open(page, later);
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await expect(modal(page).locator(".zone-tag")).toHaveText("foretold");
  await modal(page).locator(".card.playable").click();
  const castIt = menu(page).getByRole("button", { name: /Cast it for its foretell cost/ });
  // {1}{G} less {2} generic: {G} (colored mana isn't reduced).
  await expect(castIt.locator('[title="{G}"]')).toHaveCount(1);
  await expect(castIt.locator('[title="{1}"]')).toHaveCount(0);
  await castIt.click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Danitha, Benalia's Hope: put Bonesplitter from your graveyard onto the battlefield attached to her", async ({ page }) => {
  const s = scene({ hand: ["Danitha, Benalia's Hope", "Rancor"], board: LANDS, yard: ["Bonesplitter"] });
  const [danitha, rancor, bonesplitter] = [one(s, "Danitha, Benalia's Hope"), one(s, "Rancor"), one(s, "Bonesplitter")];
  await open(page, s);
  await card(page, "Danitha, Benalia's Hope", s).click();
  const now = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" || st.pending?.kind === "searchLibrary");
  if (now.pending?.kind === "chooseMay") await controls(page).getByRole("button", { name: "Yes" }).click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${rancor}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${bonesplitter}"]`).click();
  await pick.getByRole("button", { name: /^(Done|Put)/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[bonesplitter]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(after.objects[bonesplitter]!.attachedTo).toBe(danitha);
  expect(after.objects[rancor]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Star Athlete: its target's controller chooses to sacrifice it or take 5 damage", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Star Athlete", "Sol Ring"] });
  const [athlete, ring] = [one(s, "Star Athlete"), one(s, "Sol Ring")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[athlete, 1]]);
  // The trigger's target: your own Sol Ring, so the choice is yours.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${ring}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText("Sacrifice the targeted nonland permanent; if you don't, Star Athlete deals 5 damage to you?");
  await controls(page).getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life === 35);
  expect(after.objects[ring]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
