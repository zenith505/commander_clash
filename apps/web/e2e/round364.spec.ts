// Round 364: Nacatl War-Pride's token copies, each attacking the player you choose; Desperate Gambit's "choose a source you
// control" for an unblocked attacker; and Cemetery Illuminator's exile from a graveyard, then a creature spell cast from the
// top of your library because it shares a card type with the exiled card.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, card, controls, modal, resolveUntil, seat } from "./ui";

test("Nacatl War-Pride: two token copies for Ana's two creatures, one attacking Ana and one attacking Ben", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Nacatl War-Pride"] }, [{ board: ["Gray Ogre", "Hill Giant"] }]);
  const nac = one(s, "Nacatl War-Pride");
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[nac, 1]]);
  const bar = controls(page);
  await expect(bar).toContainText("choose what the token copy of Nacatl War-Pride attacks (1 of 2)");
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  await expect(bar).toContainText("choose what the token copy of Nacatl War-Pride attacks (2 of 2)");
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && idsOf(st, "Nacatl War-Pride", "battlefield").length === 3);
  const tokens = idsOf(after, "Nacatl War-Pride", "battlefield").filter((id) => id !== nac);
  expect(tokens.map((id) => after.objects[id]!.attacking).sort()).toEqual([1, 2]);
  expect(tokens.every((id) => after.objects[id]!.tapped && after.objects[id]!.isToken)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Desperate Gambit: choose your unblocked Hill Giant, then the coin decides its damage to Ana", async ({ page }) => {
  const s = scene({ hand: ["Desperate Gambit"], board: [...LANDS, "Hill Giant"] });
  const [giant, gambit] = [one(s, "Hill Giant"), one(s, "Desperate Gambit")];
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[giant, 1]]);
  // Ana declares no blocks; you get priority in the declare blockers step.
  await resolveUntil(page, (st) => st.step === "declareBlockers" && !st.pending && st.priority === 0 && st.stack.length === 0);
  await card(page, "Desperate Gambit", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("Desperate Gambit: choose a source of damage (source you control)");
  await bar.getByRole("button", { name: "Hill Giant, You's" }).click();
  const mid = await resolveUntil(page, (st) => !st.pending && st.objects[gambit]!.zone === "graveyard");
  const won = mid.log.some((l) => /flips a coin for Desperate Gambit and wins the flip/.test(l.text));
  expect(mid.damageMods?.[0]?.mod.by?.chosen?.id).toBe(giant);
  await resolveUntil(page, (st) => st.step === "main2");
  const after = await state(page);
  expect(after.players[1]!.life).toBe(won ? 34 : 40);
  expect(pageErrors(page)).toEqual([]);
});

test("Cemetery Illuminator: exile Ana's Gray Ogre, then cast the Hill Giant on top of your library", async ({ page }) => {
  const s = scene({ hand: ["Cemetery Illuminator"], board: LANDS, library: ["Hill Giant"] }, [{ yard: ["Gray Ogre"] }]);
  const [ogre, giant] = [one(s, "Gray Ogre"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Cemetery Illuminator", s).click();
  await resolveUntil(page, (st) => st.pending?.player === 0);
  const pick = modal(page);
  await pick.locator(`[data-pick="${ogre}"]`).click();
  const done = pick.getByRole("button", { name: "Done" });
  if (await done.count()) await done.click();
  await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[ogre]!.zone === "exile");
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await expect(library.locator(".zone-title")).toHaveText("Library ✦");
  await library.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(pageErrors(page)).toEqual([]);
});
