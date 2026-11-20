// Round 425 in the browser: Redemptor Dreadnought's "you may exile a creature card from your graveyard" offered as it's
// cast, then its attack trigger with the exiled Serra Angel's power; Kaya, Spirits' Justice's −2 (your Serra Angel and
// Ana's Hill Giant) and its trigger turning your token into a copy of the Serra Angel it exiled.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, invalidateCharacteristics, planCast, power, toughness, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Redemptor Dreadnought: exile Serra Angel (not the Shock) from your graveyard as you cast it", async ({ page }) => {
  const s = scene({ hand: ["Redemptor Dreadnought"], board: LANDS, yard: ["Serra Angel", "Shock"] });
  const [rd, angel, shock] = [one(s, "Redemptor Dreadnought"), one(s, "Serra Angel"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Redemptor Dreadnought", s).click();
  const offer = page.locator(".targeting", { hasText: "you may exile a creature card from your graveyard" });
  await offer.getByRole("button", { name: /^Exile a creature card from your graveyard/ }).click();
  const pick = page.locator(".modal");
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${angel}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[rd]!.zone === "battlefield");
  expect(after.objects[angel]!.zone).toBe("exile");
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Redemptor Dreadnought with Serra Angel exiled with it attacks Ana: +4/+4 until end of turn", async ({ page }) => {
  let s: GameState = scene({ hand: ["Redemptor Dreadnought"], board: LANDS, yard: ["Serra Angel"] });
  const [rd, angel] = [one(s, "Redemptor Dreadnought"), one(s, "Serra Angel")];
  // Cast it with the exile paid, resolve it, and come to your declare attackers step on a later turn.
  for (const a of planCast(s, 0, rd, undefined, undefined, "auto", undefined, { kicks: [0], exileCards: [angel] })!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.stack.length === 0 && st.objects[rd]!.zone === "battlefield");
  s.objects[rd]!.controlledSinceTurn = -1;
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: rd, defender: 1 }] });
  await open(page, s);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && power(st, st.objects[rd]!) === 8);
  expect([power(after, after.objects[rd]!), toughness(after, after.objects[rd]!)]).toEqual([8, 8]);
  expect(after.objects[angel]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Kaya, Spirits' Justice: −2 exiles your Serra Angel and Ana's Hill Giant; your token becomes a Serra Angel", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Kaya, Spirits' Justice", "Serra Angel", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [kaya, angel, tok, giant] = [one(s, "Kaya, Spirits' Justice"), one(s, "Serra Angel"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  // The Grizzly Bears is a token here (the scene's way of giving you one).
  s.objects[tok]!.isToken = true;
  s.objects[kaya]!.counters = { loyalty: 3 };
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${kaya}"]`).first().click();
  await menu(page).locator("button", { hasText: "Exile target creature you control" }).click();
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  // "Up to one" for each opponent: Ben and Cy have no creature; Done.
  const panel = page.locator(".targeting", { hasText: "Kaya, Spirits' Justice" });
  await expect(panel).toContainText("one for each opponent: Ana Hill Giant, Ben —, Cy —");
  await panel.getByRole("button", { name: "Done" }).click();
  // Its trigger: your Serra Angel was exiled; target the token.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(page.locator(".targeting")).toContainText("choose target token you control");
  await page.locator(`[data-obj="${tok}"]`).first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyAmong");
  expect((asked.pending as { options: string[] }).options).toEqual([angel, "none"]);
  expect([asked.objects[angel]!.zone, asked.objects[giant]!.zone]).toEqual(["exile", "exile"]);
  const c = controls(page);
  await expect(c).toContainText("you may have Grizzly Bears become a copy of a creature card, except it has flying, until end of turn.");
  await c.getByRole("button", { name: "Serra Angel", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && characteristics(st, st.objects[tok]!).name === "Serra Angel");
  const ch = characteristics(after, after.objects[tok]!);
  expect([ch.power, ch.toughness, ch.keywords.includes("Flying")]).toEqual([4, 4, true]);
  expect(after.objects[kaya]!.counters.loyalty).toBe(1);
  expect(idsOf(after, "Hill Giant", "exile", 1)).toEqual([giant]);
  expect(pageErrors(page)).toEqual([]);
});
