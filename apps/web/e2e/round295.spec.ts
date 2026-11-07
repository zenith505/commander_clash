// Round 295's prompts: Back for Seconds bargained (one of the returned cards onto the battlefield instead), Kamiz's
// "another attacking creature with lesser power", Nine-Fingers Keene's Gate from the top nine cards.
import { expect, test } from "@playwright/test";
import { applyAction, objHasKeyword, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, playWithBots, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("Back for Seconds bargained: pick Grizzly Bears to put onto the battlefield; Craw Wurm (mana value 6) goes to your hand", async ({ page }) => {
  const s0 = scene({ hand: ["Back for Seconds"], board: [...LANDS, "Ornithopter"], yard: ["Grizzly Bears", "Craw Wurm"] });
  const [spell, thopter, bears, wurm] = [one(s0, "Back for Seconds"), one(s0, "Ornithopter"), one(s0, "Grizzly Bears"), one(s0, "Craw Wurm")];
  let s: GameState = s0;
  const plan = planCast(s, 0, spell, [{ kind: "object", id: bears }, { kind: "object", id: wurm }], undefined, undefined, undefined, { bargain: thopter });
  expect(plan).not.toBeNull();
  for (const a of plan!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  // Only the card with mana value 4 or less is offered.
  expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [bears] });
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Back for Seconds");
  await expect(pick).toContainText("onto the battlefield instead of into your hand");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[wurm]!.zone).toBe("hand");
  expect(after.objects[thopter]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Kamiz: Hill Giant connives, then click Grizzly Bears (lesser power) to give it double strike", async ({ page }) => {
  const s0 = scene({ board: ["Kamiz, Obscura Oculus", "Hill Giant", "Grizzly Bears", "Elite Vanguard"] });
  const [giant, bears, vanguard] = [one(s0, "Hill Giant"), one(s0, "Grizzly Bears"), one(s0, "Elite Vanguard")];
  let s = playWithBots(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0, [[giant, 1], [bears, 1], [vanguard, 1]]);
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: giant }] });
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  // The target itself isn't offered; both smaller attackers are.
  expect([...(s.pending as { options: string[] }).options].sort()).toEqual([bears, vanguard].sort());
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.log.some((l) => l.text.includes("double strike")));
  expect(objHasKeyword(after, after.objects[bears]!, "Double strike")).toBe(true);
  expect(objHasKeyword(after, after.objects[vanguard]!, "Double strike")).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Nine-Fingers Keene: pick the ninth Gate from the top nine cards; the other eight go to your hand", async ({ page }) => {
  const gates = ["Azorius Guildgate", "Boros Guildgate", "Dimir Guildgate", "Golgari Guildgate", "Gruul Guildgate", "Izzet Guildgate", "Orzhov Guildgate", "Rakdos Guildgate"];
  const s0 = scene({ board: ["Nine-Fingers Keene", ...gates], library: ["Selesnya Guildgate"] });
  const [keene, gate] = [one(s0, "Nine-Fingers Keene"), one(s0, "Selesnya Guildgate")];
  const top = s0.players[0]!.library.slice(0, 9);
  const hand = s0.players[0]!.hand.length;
  const s = playWithBots(s0, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0, [[keene, 1]]);
  expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [gate] });
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Nine-Fingers Keene");
  await pick.locator(`[data-pick="${gate}"]`).click();
  await pick.getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[gate]!.zone === "battlefield");
  expect(top.slice(1).every((id) => after.objects[id]!.zone === "hand")).toBe(true);
  expect(after.players[0]!.hand.length).toBe(hand + 8);
  expect(pageErrors(page)).toEqual([]);
});
