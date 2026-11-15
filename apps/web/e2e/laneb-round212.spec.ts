// Lane B round B212 in the browser: Channel Harm's "deal the prevented damage?" question in combat, Decoy Gambit cast
// by Ana at your Grizzly Bears (you choose: Ana draws, or your bear returns), and Fade Away's pay-{1}-or-sacrifice
// choice for each of your creatures, its payment, and the permanent you pick.
import { expect, test } from "@playwright/test";
import { applyAction, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, resolveUntil } from "./ui";

test("Channel Harm: Razorgrass Screen's 2 damage to your Hill Giant is prevented, and you have Channel Harm deal 2 to Ben's Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Channel Harm"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Razorgrass Screen"] }, { board: ["Grizzly Bears"] }]);
  const [channel, giant, bears] = [one(s, "Channel Harm"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Channel Harm", s).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[channel]!.zone === "graveyard");
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[giant, 1]]);
  // Razorgrass Screen blocks each combat if able; its 2 damage to Hill Giant is prevented.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Channel Harm: 2 damage was prevented. Deal that much damage to Grizzly Bears?");
  await expect(bar.getByRole("button", { name: "Don't deal it" })).toBeVisible();
  await bar.getByRole("button", { name: "Deal 2 damage to Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.damage).toBe(0);
  expect(after.log.some((l) => l.text.startsWith("Channel Harm deals 2 damage to Grizzly Bears"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Decoy Gambit: Ana targets your Grizzly Bears, and you let her draw a card so the bear stays", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears"] }, [{ hand: ["Decoy Gambit"], board: ["Island", "Island", "Island"] }]);
  const [decoy, bears] = [one(s0, "Decoy Gambit"), one(s0, "Grizzly Bears")];
  let s = s0;
  s.priority = 1;
  // Ana's opponents in turn order after her: Ben, Cy, then you.
  for (const a of planCast(s, 1, decoy, [{ kind: "none" }, { kind: "none" }, { kind: "object", id: bears }])!) s = applyAction(s, a);
  const hand = s.players[1]!.hand.length;
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Decoy Gambit: Have Ana draw a card? If you don't, Grizzly Bears returns to its owner's hand.");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[decoy]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.players[1]!.hand.length).toBe(hand + 1);
  expect(after.log.some((l) => l.text === "You has Ana draw a card.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Fade Away: for your two creatures you pay {1} once, then, out of mana, sacrifice your Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Fade Away"], board: ["Island", "Island", "Island", "Plains", "Grizzly Bears", "Savannah Lions"] });
  const [fade, bears, lions] = [one(s, "Fade Away"), one(s, "Grizzly Bears"), one(s, "Savannah Lions")];
  await open(page, s);
  await card(page, "Fade Away", s).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Pay {1} or sacrifice a permanent? (1 of 2)");
  // No "neither": one of the two must be chosen.
  await expect(bar.getByRole("button")).toHaveCount(2);
  await bar.getByRole("button", { name: "Pay {1}" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  // The Plains paid {1}: now only the sacrifice is left.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  await expect(bar).toContainText("(2 of 2)");
  await expect(bar.getByRole("button", { name: "Pay {1}" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Sacrifice a permanent" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[fade]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[lions]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
