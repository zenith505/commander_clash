// Lane B round B247 in the browser: Expert-Level Safe's secret number (1 to 3) against target opponent's; Urgent Necropsy's
// evidence, picked after its targets for their total mana value; Inniaz, the Gale Force's picks for every player, each a
// nonland permanent of the player to their right.
import { expect, test } from "@playwright/test";
import { controllerOf, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Expert-Level Safe: target Ana, choose 3 with + (no higher), and the numbers are revealed together", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Expert-Level Safe"] }, [{ board: ["Grizzly Bears"] }]);
  const safe = one(s, "Expert-Level Safe");
  const top = s.players[0]!.library.slice(0, 2);
  // Two cards exiled with it as it entered.
  for (const id of top) {
    s.players[0]!.library = s.players[0]!.library.filter((x) => x !== id);
    s.players[0]!.exile.push(id);
    s.objects[id]!.zone = "exile";
    s.objects[id]!.hiddenExile = { by: safe, seen: [], label: "Face down", at: 0 };
  }
  s.linkedExile = { [`${safe}@${s.objects[safe]!.zoneChanges ?? 0}`]: top.map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  await open(page, s);
  await page.locator(`[data-obj="${safe}"]`).click();
  await menu(page).getByRole("button", { name: /secretly choose 1, 2, or 3/ }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "secretNumber" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("secretly choose 1, 2, or 3");
  await expect(bar.getByRole("button", { name: "Number minus one" })).toBeDisabled();
  const plus = bar.getByRole("button", { name: "Number plus one" });
  await plus.click();
  await plus.click();
  await expect(plus).toBeDisabled();
  await bar.getByRole("button", { name: "Choose 3" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.log.some((l) => /The numbers (match|don't match)\./.test(l.text)));
  const reveal = after.log.find((l) => /The numbers are revealed: You 3, Ana [123]\./.test(l.text));
  expect(reveal).toBeTruthy();
  if (/Ana 3/.test(reveal!.text)) {
    // A match: the Safe is sacrificed and the two cards come to your hand.
    expect(after.objects[safe]!.zone).toBe("graveyard");
    expect(top.map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand"]);
  } else {
    // No match: one more card exiled face down with it.
    expect(after.objects[safe]!.zone).toBe("battlefield");
    expect(after.players[0]!.exile.length).toBe(3);
  }
  expect(pageErrors(page)).toEqual([]);
});

test("Urgent Necropsy: target Ana's Sol Ring and Grizzly Bears, then collect evidence 3 for them", async ({ page }) => {
  const s = scene({ hand: ["Urgent Necropsy"], board: LANDS, yard: ["Hill Giant", "Shock", "Divination"] }, [{ board: ["Sol Ring", "Grizzly Bears"] }]);
  const [necropsy, ring, bears, giant, shock, divination] = [one(s, "Urgent Necropsy"), one(s, "Sol Ring"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Urgent Necropsy", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  // One "up to one" target at a time: the artifact, the creature, then none for the enchantment and the planeswalker.
  const panel = page.locator(".targeting", { hasText: "Urgent Necropsy" });
  await expect(panel).toContainText("choose target artifact");
  await page.locator(`[data-obj="${ring}"]`).click();
  await expect(panel).toContainText("choose target creature");
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(panel).toContainText("choose target enchantment");
  await panel.getByRole("button", { name: "Done" }).click();
  await expect(panel).toContainText("choose target planeswalker");
  await panel.getByRole("button", { name: "Done" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Urgent Necropsy: collect evidence 3");
  await expect(pick.getByRole("button", { name: "Don't collect evidence" })).toHaveCount(0);
  await pick.locator(`[data-pick="${shock}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${divination}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[necropsy]!.zone === "graveyard");
  expect([ring, bears].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect([shock, divination, giant].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Inniaz: three fliers attack; you pick for yourself from Cy, for Cy from Ben, Ben gets Ana's only one, and Ana one of yours", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Inniaz, the Gale Force", "Wind Drake", "Ornithopter"] }, [{ board: ["Sol Ring"] }, { board: ["Grizzly Bears", "Hill Giant"] }, { board: ["Mind Stone", "Gray Ogre"] }]);
  const [inniaz, drake, thopter, ring, bears, giant, stone, ogre] = [one(s0, "Inniaz, the Gale Force"), one(s0, "Wind Drake"), one(s0, "Ornithopter"), one(s0, "Sol Ring"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Mind Stone"), one(s0, "Gray Ogre")];
  await open(page, playUntil(s0, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[inniaz, 1], [drake, 1], [thopter, 1]]);
  const bar = controls(page);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  // You first, from the player to your right (Cy, who plays before you).
  await expect(bar).toContainText("choose a nonland permanent Cy controls: you gain control of it.");
  await page.locator(`[data-obj="${ogre}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.pickFor === 3);
  await expect(bar).toContainText("choose a nonland permanent Ben controls: Cy gains control of it.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  // Ben takes Ana's Sol Ring without a question; for Ana, one of yours (no lands offered).
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.pickFor === 1);
  expect(mid.pending?.kind === "pickPermanents" && [...mid.pending.options].sort()).toEqual([inniaz, drake, thopter].sort());
  await expect(bar).toContainText("choose a nonland permanent you control: Ana gains control of it.");
  await page.locator(`[data-obj="${thopter}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const ctl = (st: GameState, id: string) => controllerOf(st, st.objects[id]!);
  const after = await resolveUntil(page, (st) => !st.pending?.kind.startsWith("pick") && ctl(st, thopter) === 1);
  expect([ogre, giant, ring, thopter].map((id) => ctl(after, id))).toEqual([0, 3, 2, 1]);
  expect([bears, stone, inniaz, drake].map((id) => ctl(after, id))).toEqual([2, 3, 0, 0]);
  // The Ornithopter given away left combat (CR 506.4); the others still attack.
  expect(after.objects[thopter]!.attacking).toBeUndefined();
  expect(after.objects[drake]!.attacking).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
