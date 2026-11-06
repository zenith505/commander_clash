// Round 285 in the browser: Speedball, New Warrior's trigger asks its controller for new targets for the spell that
// targeted it; Kaldring, the Rimestaff's target is a snow card in your graveyard, which you then play from there (it
// enters tapped); Whispersteel Dagger lets you cast a creature spell from the damaged player's graveyard (their graveyard
// shows it as playable).
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Speedball, New Warrior: Shock it, then pick Grizzly Bears as Shock's new target; Speedball is 4/4 and undamaged", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Speedball, New Warrior", "Grizzly Bears"] });
  const [sb, bears] = [one(s, "Speedball, New Warrior"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${sb}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "newTargets");
  await expect(page.locator(".targeting")).toContainText("Speedball, New Warrior");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[sb]!.zone).toBe("battlefield");
  expect(after.objects[sb]!.damage).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Kaldring, the Rimestaff: pick the snow land in your graveyard, then play it from there; it enters tapped", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Jorn, God of Winter // Kaldring, the Rimestaff"], yard: ["Snow-Covered Forest", "Forest"] });
  const k = one(s, "Jorn, God of Winter");
  s.objects[k]!.face = 1;
  invalidateCharacteristics(s);
  const snow = one(s, "Snow-Covered Forest");
  const plain = s.players[0]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
  await open(page, s);
  await page.locator(`[data-obj="${k}"]`).first().click();
  await menu(page).getByRole("button", { name: /You may play target snow permanent card/ }).click();
  // The targets to pick from: only the snow card in your graveyard.
  const pick = modal(page);
  await expect(pick).toContainText("choose target snow permanent card from your graveyard");
  await expect(pick.locator(`[data-pick="${plain}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${snow}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[snow]!.mayPlay);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Snow-Covered Forest" }).click();
  await menu(page).getByRole("button", { name: "Play it", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[snow]!.zone === "battlefield");
  expect(after.objects[snow]!.tapped).toBe(true);
  expect(after.players[0]!.landsPlayedThisTurn).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Whispersteel Dagger: after combat damage to Ana, cast Llanowar Elves from her graveyard", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Grizzly Bears", "Whispersteel Dagger"] }, [{ yard: ["Llanowar Elves", "Hill Giant"] }]);
  const [bears, dagger, elves] = [one(s, "Grizzly Bears"), one(s, "Whispersteel Dagger"), one(s, "Llanowar Elves")];
  s.objects[dagger]!.attachedTo = bears;
  invalidateCharacteristics(s);
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: bears, defender: 1 }] });
  s = playUntil(s, (st) => st.step === "main2" && st.stack.length === 0 && !st.pending && st.priority === 0);
  expect(s.graveGrants?.some((g) => g.player === 0 && g.fromYardOf === 1)).toBe(true);
  await open(page, s);
  await expect(page.locator('[data-graveyard="1"] .zone-title')).toHaveText("Graveyard ✦");
  await page.locator('[data-graveyard="1"]').click();
  await modal(page).locator(".card.playable", { hasText: "Llanowar Elves" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[elves]!.zone === "battlefield");
  expect(after.objects[elves]!.controller).toBe(0);
  expect(after.objects[elves]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
