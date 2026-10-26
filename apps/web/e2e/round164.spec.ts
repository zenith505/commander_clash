// Round 164: Evercoat Ursine's pick of one of its two hidden cards to play free, Krark's Thumb's choice of which of two
// flipped coins to keep, and Timeline Culler cast from the graveyard for its warp cost only.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, invalidateCharacteristics, planActivate, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playWithBots, scene } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

test("Evercoat Ursine: dealing combat damage, pick one of its two hidden cards and cast it free", async ({ page }) => {
  const s0 = scene({ board: ["Evercoat Ursine"], exile: ["Hill Giant", "Grizzly Bears"] });
  const [ursine, giant, bears] = [one(s0, "Evercoat Ursine"), one(s0, "Hill Giant"), one(s0, "Grizzly Bears")];
  // Hidden away when it entered (CR 702.75a), face down and linked to it (CR 607.2a).
  s0.linkedExile = { [`${ursine}@${s0.objects[ursine]!.zoneChanges ?? 0}`]: [giant, bears].map((id) => ({ id, zc: s0.objects[id]!.zoneChanges ?? 0 })) };
  for (const id of [giant, bears]) s0.objects[id]!.hiddenExile = { by: ursine, seen: [0] };
  invalidateCharacteristics(s0);
  const s = playWithBots(s0, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0, [[ursine, 1]]);
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("to play without paying its mana cost");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const bar = controls(page);
  await expect(bar).toContainText("Hill Giant");
  await bar.getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

/** Bottle of Suleiman activated with Krark's Thumb out, resolved up to the Thumb's question: one coin won, one lost. */
function thumbQuestion(): GameState {
  const s0 = scene({ board: ["Krark's Thumb", "Bottle of Suleiman", ...LANDS] });
  const bottle = one(s0, "Bottle of Suleiman");
  for (let seed = 1; seed < 200; seed++) {
    let s = structuredClone(s0);
    for (const a of planActivate(s, 0, bottle, 0)!) s = applyAction(s, a);
    s.rngState = seed;
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) {
      const pid = waitingOn(s)!;
      s = applyAction(s, pid === 0 ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
    }
    if (s.pending?.kind === "chooseMay" && s.pending.thumb) return s;
  }
  throw new Error("no seed flips one won and one lost coin");
}

for (const keep of ["Yes", "No"] as const)
  test(`Krark's Thumb: one coin won and one lost, ${keep === "Yes" ? "keep the won flip: a Djinn" : "keep the lost one: 5 damage"}`, async ({ page }) => {
    const s = thumbQuestion();
    const life = s.players[0]!.life;
    await open(page, s);
    const bar = controls(page);
    await expect(bar).toContainText("Keep the won coin flip");
    await bar.getByRole("button", { name: keep }).click();
    const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
    const djinns = after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0);
    expect(djinns).toHaveLength(keep === "Yes" ? 1 : 0);
    expect(after.players[0]!.life).toBe(keep === "Yes" ? life : life - 5);
    expect(pageErrors(page)).toEqual([]);
  });

test("Timeline Culler: from the graveyard only its warp button casts it, for {B} and 2 life", async ({ page }) => {
  const s = scene({ board: LANDS, yard: ["Timeline Culler"] });
  const culler = one(s, "Timeline Culler");
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Timeline Culler" }).click();
  await expect(menu(page).getByRole("button", { name: "Cast from graveyard B B", exact: true })).toBeDisabled();
  await menu(page).getByRole("button", { name: "Cast from graveyard: Warp B and pay 2 life" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[culler]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});
