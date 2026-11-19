// Lane B round B262 in the browser: Bitter Feud's two players chosen as it enters; Immortal Coil's graveyard cards picked
// for the damage it prevents; Winter's Chill cast with X against Ana's attackers, and its {2} / {1} questions when Ana
// casts it against your attacker.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Bitter Feud: cast it and click Ana, then Ben; they are the chosen players", async ({ page }) => {
  const s = scene({ hand: ["Bitter Feud"], board: LANDS });
  const feud = one(s, "Bitter Feud");
  await open(page, s);
  await card(page, "Bitter Feud", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose two players: the first");
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  let mid: GameState = s;
  await expect.poll(async () => (mid = await state(page)).objects[feud]!.chosen?.players?.length ?? 0).toBe(1);
  await expect(bar).toContainText("choose the second of two players");
  await expect(bar.getByRole("button", { name: "Ana", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[feud]!.zone === "battlefield" && !st.pending && (st.objects[feud]!.chosen?.players?.length ?? 0) === 2);
  expect(mid.objects[feud]!.chosen?.players).toEqual([1]);
  expect(after.objects[feud]!.chosen?.players).toEqual([1, 2]);
  expect(pageErrors(page)).toEqual([]);
});

test("Immortal Coil: Ana's Grizzly Bears hit you; the damage is prevented and you click two graveyard cards to exile", async ({ page }) => {
  let s: GameState = scene({ board: ["Immortal Coil"], yard: ["Hill Giant", "Craw Wurm", "Snow-Covered Island"] }, [{ board: ["Grizzly Bears"] }]);
  const [bears, giant, wurm, snow] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Craw Wurm"), one(s, "Snow-Covered Island")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: bears, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Immortal Coil: exile 2 cards from your graveyard for the damage prevented (1 of 2). Which one?");
  await bar.getByRole("button", { name: "Craw Wurm", exact: true }).click();
  await expect(bar).toContainText("(2 of 2)");
  await bar.getByRole("button", { name: "Hill Giant", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[wurm]!.zone === "exile" && st.objects[giant]!.zone === "exile" && !st.pending);
  expect(after.players[0]!.life).toBe(40);
  expect(after.objects[snow]!.zone).toBe("graveyard");
  expect(after.players[0]!.lost).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});

test("Winter's Chill: Ana attacks you; choose X = 2, click her two attackers; she can't pay, so both are destroyed at end of combat", async ({ page }) => {
  let s: GameState = scene({ hand: ["Winter's Chill"], board: ["Snow-Covered Island", "Snow-Covered Island", "Island"] }, [{ board: ["Hill Giant", "Grizzly Bears"] }]);
  const [chill, giant, bears] = [one(s, "Winter's Chill"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }, { attacker: bears, defender: 0 }] });
  s = playUntil(s, (st) => st.step === "declareAttackers" && !st.pending && waitingOn(st) === 0);
  await open(page, s);
  await card(page, "Winter's Chill", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toBeVisible();
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const panel = page.locator(".targeting", { hasText: "Winter's Chill" });
  await expect(panel).toBeVisible();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "graveyard" && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[chill]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(35);
  expect(after.log.some((l) => /Hill Giant will be destroyed at end of combat/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Winter's Chill: Ana casts it on your Hill Giant; click Don't pay for {2}, then Pay for {1}: no combat damage to or by it", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Hill Giant"] }, [{ hand: ["Winter's Chill"], board: ["Snow-Covered Island", "Island", "Island"] }]);
  const [giant, chill] = [one(s, "Hill Giant"), one(s, "Winter's Chill")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: giant, defender: 1 }] });
  s = playUntil(s, (st) => st.step === "declareAttackers" && !st.pending && waitingOn(st) === 1);
  for (const a of planCast(s, 1, chill, [{ kind: "object", id: giant }], undefined, undefined, 1)!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Winter's Chill:");
  await expect(bar).toContainText("or choose next whether to pay {1} (all combat damage to and by Hill Giant this combat is prevented) or nothing (Hill Giant is destroyed at end of combat).");
  await bar.getByRole("button", { name: "Don't pay" }).click();
  await expect(bar).toContainText("or Hill Giant is destroyed at end of combat. Paying {1}, all combat damage that would be dealt to and dealt by Hill Giant this combat is prevented.");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.step === "main2" || st.step === "end");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.players[1]!.life).toBe(40);
  expect(after.log.some((l) => /pays \{1\} for Hill Giant/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
