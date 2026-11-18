// Lane B round B258 in the browser: Sorrow's Path's and General Jarkeld's two-target abilities swap blocks; Worms of the
// Earth's upkeep question offers you "Sacrifice 2 lands" or "Be dealt 5 damage".
import { expect, test } from "@playwright/test";
import { applyAction, waitingOn, type GameState } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

/** You attack Ana with Hill Giant and Craw Wurm; she blocks the Giant with Giant Badger and the Wurm with Grizzly Bears. Your priority in declare blockers. */
function blocked(board: string[]) {
  let s = scene({ board: [...LANDS, "Hill Giant", "Craw Wurm", ...board] }, [{ board: ["Giant Badger", "Grizzly Bears"] }]);
  const [giant, wurm, badger, bears] = [one(s, "Hill Giant"), one(s, "Craw Wurm"), one(s, "Giant Badger"), one(s, "Grizzly Bears")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: giant, defender: 1 }, { attacker: wurm, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [{ blocker: badger, attacker: giant }, { blocker: bears, attacker: wurm }] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && !st.stack.length && !st.triggerQueue.length && waitingOn(st) === 0);
  return { s, giant, wurm, badger, bears };
}

test("Sorrow's Path: click Ana's two blockers; they swap, and it deals 2 damage to you as it's tapped", async ({ page }) => {
  const { s, giant, wurm, badger, bears } = blocked(["Sorrow's Path"]);
  const path = one(s, "Sorrow's Path");
  await open(page, s);
  await page.locator(`[data-obj="${path}"]`).first().click();
  await menu(page).getByRole("button", { name: /Choose two target blocking creatures controlled by the same opponent/ }).click();
  await page.locator(`[data-obj="${badger}"]`).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.stack.length && st.objects[badger]!.blocking?.[0] === wurm);
  expect(after.objects[bears]!.blocking).toEqual([giant]);
  expect(after.objects[giant]!.blockedBy).toEqual([bears]);
  expect(after.players[0]!.life).toBe(38);
  expect(after.log.some((l) => l.text === "Sorrow's Path removes Giant Badger and Grizzly Bears from combat.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("General Jarkeld: click your two blocked attackers; their blockers swap", async ({ page }) => {
  const { s, giant, wurm, badger, bears } = blocked(["General Jarkeld"]);
  const jarkeld = one(s, "General Jarkeld");
  await open(page, s);
  await page.locator(`[data-obj="${jarkeld}"]`).first().click();
  await menu(page).getByRole("button", { name: /Choose two target blocked attacking creatures/ }).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await page.locator(`[data-obj="${wurm}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.stack.length && st.objects[giant]!.blockedBy?.[0] === bears);
  expect(after.objects[wurm]!.blockedBy).toEqual([badger]);
  expect(after.objects[jarkeld]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Worms of the Earth: at Ana's upkeep, click Sacrifice 2 lands, then two lands; it's destroyed", async ({ page }) => {
  let s: GameState = scene({ board: ["Plains", "Island", "Swamp", "Worms of the Earth"] });
  const land = (name: string) => idsOf(s, name, "battlefield", 0)[0]!;
  const [worms, plains, island, swamp] = [one(s, "Worms of the Earth"), land("Plains"), land("Island"), land("Swamp")];
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher");
  // Ana (the active player), Ben and Cy are asked first, in turn order; they decline.
  for (let i = 0; i < 4 && s.pending?.kind === "chooseOption" && s.pending.player !== 0; i++) s = applyAction(s, { type: "chooseOption", player: s.pending.player, choice: "none" });
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "punisher" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Sacrifice 2 lands or be dealt 5 damage? If anyone does, destroy Worms of the Earth.");
  await expect(bar.getByRole("button", { name: "Be dealt 5 damage", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Sacrifice 2 lands", exact: true }).click();
  let mid: GameState = s;
  await expect.poll(async () => (mid = await state(page)).pending?.kind).toBe("pickPermanents");
  await page.locator(`[data-obj="${plains}"]`).first().click();
  await page.locator(`[data-obj="${island}"]`).first().click();
  await bar.getByRole("button", { name: /^Sacrifice/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[worms]!.zone === "graveyard");
  expect(after.objects[plains]!.zone).toBe("graveyard");
  expect(after.objects[island]!.zone).toBe("graveyard");
  expect(after.objects[swamp]!.zone).toBe("battlefield");
  expect(mid.pending?.player).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
