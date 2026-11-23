// Round 454: controlling another player (CR 723). Secret of Bloodbending gives you Ana's next combat phase only: the note
// says so, you declare her attack from her seat, and once the phase is over she plays on by herself. The Dominion
// Bracelet's equipped creature exiles the Bracelet to give you Ana's next turn.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { attack, card, clickPlayer, menu, resolveUntil, seat } from "./ui";

test("Secret of Bloodbending: you control Ana during her next combat phase only; her Grizzly Bears attack Ben", async ({ page }) => {
  const s = scene({ hand: ["Secret of Bloodbending"], board: ["Island", "Island", "Island", "Island"] }, [{ board: ["Grizzly Bears"] }]);
  const [secret, bears] = [one(s, "Secret of Bloodbending"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Secret of Bloodbending", s).click();
  // Its waterbend {10} can't be paid with four Islands and no creatures: "Don't pay", then the target you click.
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("pay waterbend");
  await expect(bar.getByRole("button", { name: "Pay waterbend", exact: true })).toBeDisabled();
  await bar.getByRole("button", { name: "Don't pay", exact: true }).click();
  await expect(bar).toContainText("target opponent");
  await clickPlayer(page, 1);
  const cast = await resolveUntil(page, (st) => st.objects[secret]!.zone === "exile" && st.stack.length === 0);
  expect(cast.playerControls).toEqual([expect.objectContaining({ controlled: 1, controller: 0, combat: true })]);
  expect(cast.log.some((l) => l.text === "You will control Ana during Ana's next combat phase.")).toBe(true);
  // Her combat phase: yours to play from her seat.
  const combat = await resolveUntil(page, (st) => st.activePlayer === 1 && st.pending?.kind === "declareAttackers" && st.pending.player === 1, 80);
  expect(combat.controlledTurn).toEqual(expect.objectContaining({ controlled: 1, controller: 0 }));
  await expect(page.locator(".control-note")).toHaveText("You control Ana this combat phase");
  await expect(seat(page, 1)).toHaveClass(/\bme\b/);
  await attack(page, [[bears, 2]]);
  // Ana's own main phase or later (the bots play on without stopping for you).
  const after = await resolveUntil(page, (st) => st.turn > combat.turn || (st.activePlayer === 1 && ["main2", "end", "cleanup"].includes(st.step)), 40);
  // Ben took 2; the phase is over, and Ana is her own again.
  expect(after.players[2]!.life).toBe(38);
  expect(after.controlledTurn).toBeUndefined();
  await expect(page.locator(".control-note")).toHaveCount(0);
  await expect(seat(page, 0)).toHaveClass(/\bme\b/);
  expect(pageErrors(page)).toEqual([]);
});

test("The Dominion Bracelet: equip it to Hill Giant, then its {15} ability costs {11}, exiles the Bracelet and gives you Ana's next turn", async ({ page }) => {
  const s = scene({ board: ["Island", "Island", "Island", "Swamp", "Swamp", "Swamp", "Mountain", "Mountain", "Mountain", "Forest", "Forest", "Forest", "Hill Giant", "The Dominion Bracelet"] });
  const [giant, bracelet] = [one(s, "Hill Giant"), one(s, "The Dominion Bracelet")];
  await open(page, s);
  // Equip {1}.
  await card(page, "The Dominion Bracelet", s).click();
  await menu(page).locator("button", { hasText: "Equip" }).click();
  await expect(page.locator(".targeting")).toContainText("target creature you control");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const equipped = await resolveUntil(page, (st) => st.objects[bracelet]!.attachedTo === giant && st.stack.length === 0);
  // Eleven lands left: just enough for {15} less the Giant's power of 4.
  expect(equipped.battlefield.filter((id) => !equipped.objects[id]!.tapped && equipped.cards[equipped.objects[id]!.cardId]!.types.includes("Land")).length).toBe(11);
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await menu(page).locator("button", { hasText: "Exile The Dominion Bracelet" }).click();
  await expect(page.locator(".targeting")).toContainText("target opponent");
  await clickPlayer(page, 1);
  const done = await resolveUntil(page, (st) => st.objects[bracelet]!.zone === "exile" && st.stack.length === 0 && !!st.playerControls?.length);
  expect(done.playerControls).toEqual([expect.objectContaining({ controlled: 1, controller: 0 })]);
  expect(done.playerControls![0]!.combat).toBeUndefined();
  expect(idsOf(done, "Island", "battlefield", 0).every((id) => done.objects[id]!.tapped)).toBe(true);
  // Ana's next turn is yours.
  const hers = await resolveUntil(page, (st) => st.activePlayer === 1 && st.step === "main1" && !!st.controlledTurn, 80);
  expect(hers.controlledTurn).toEqual(expect.objectContaining({ controlled: 1, controller: 0 }));
  await expect(page.locator(".control-note")).toHaveText("You control Ana this turn");
  await expect(seat(page, 1)).toHaveClass(/\bme\b/);
  expect(pageErrors(page)).toEqual([]);
});
