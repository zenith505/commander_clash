// Round 419 in the browser: Missy's villainous choice you face at Ana's end step, and an opponent's creature Missy
// returns face down as your 2/2 Cyberman; Shifting Shadow cast on your Grizzly Bears, then at your upkeep the Bears is
// destroyed and the Hill Giant revealed gets the Aura; Balthier and Fran crewing Sky Skiff, which attacks, and paying
// {1}{R}{G} for an additional combat phase.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, card, controls, menu, passTo, resolveUntil } from "./ui";

test("Missy: at Ana's end step you face her villainous choice and take 1 damage from each of her artifact creatures", async ({ page }) => {
  const s0 = scene({ board: LANDS }, [{ board: ["Missy", "Ornithopter", "Memnite", "Grizzly Bears"] }]);
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "villainous" && st.pending.player === 0);
  const life = s.players[0]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Missy");
  await expect(bar.getByRole("button", { name: /You draw a card and chaos ensues/ })).toBeVisible();
  await bar.getByRole("button", { name: /Each artifact creature you control deals 1 damage to that opponent/ }).click();
  // Ornithopter and Memnite, 1 each; the Grizzly Bears isn't an artifact.
  let seen = s;
  await expect.poll(async () => (seen = await state(page)).players[0]!.life).toBe(life - 2);
  expect(seen.log.some((e) => /villainous choice/.test(typeof e === "string" ? e : e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Missy: Lightning Bolt kills Ana's Grizzly Bears, which returns face down and tapped under your control as a 2/2 Cyberman", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Missy"] }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  const o = after.objects[bears]!;
  expect([o.faceDown, o.tapped, o.controller, o.owner]).toEqual(["cyberman", true, 0, 1]);
  // It's on your side of the table now.
  await expect(page.locator(`section.seat[data-seat="0"] [data-obj="${bears}"]`)).toHaveCount(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Shifting Shadow: cast on Grizzly Bears; at your upkeep the Bears is destroyed and Hill Giant enters with the Aura", async ({ page }) => {
  const s = scene({ hand: ["Shifting Shadow"], board: [...LANDS, "Grizzly Bears"], library: ["Plains", "Hill Giant"] });
  const [bears, shadow, giant] = [one(s, "Grizzly Bears"), one(s, "Shifting Shadow"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Shifting Shadow", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const cast = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[shadow]!.zone === "battlefield");
  expect(cast.objects[shadow]!.attachedTo).toBe(bears);
  // Round the table in the engine: your next upkeep, the Bears' trigger on the stack.
  const up = playUntil(cast, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.stack.length === 1);
  await open(page, up);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[shadow]!.attachedTo).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Balthier and Fran: crews Sky Skiff, which attacks Ana; paying {1}{R}{G} adds a combat phase", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Balthier and Fran", "Sky Skiff"] });
  const [bf, skiff] = [one(s, "Balthier and Fran"), one(s, "Sky Skiff")];
  await open(page, s);
  await page.locator(`[data-obj="${skiff}"]`).first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /Crew 1/ }).click();
  const crewBar = page.locator(".targeting");
  await expect(crewBar).toContainText("Crew Sky Skiff");
  // Balthier and Fran, the only creature, is picked already.
  await expect(crewBar).toContainText("(now 4)");
  await crewBar.getByRole("button", { name: "Crew" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bf]!.tapped === true);
  await passTo(page, "declareAttackers");
  await attack(page, [[skiff, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Balthier and Fran");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const paid = await resolveUntil(page, (st) => (st.addedPhases ?? []).includes("combat"));
  // Vigilance from Balthier and Fran: Sky Skiff is still untapped, ready for the next combat.
  expect(paid.objects[skiff]!.tapped).toBe(false);
  const next = await resolveUntil(page, (st) => st.step === "declareAttackers" && st.activePlayer === 0 && (st.combatsThisTurn ?? 0) === 2, 80);
  expect(next.turn).toBe(s.turn);
  expect(pageErrors(page)).toEqual([]);
});
