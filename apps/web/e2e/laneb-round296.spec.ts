// Lane B round B296 in the browser: Havengul Laboratory (transforms at the end step, you pick the creature card to return,
// it dies to Murder and Havengul Mystery transforms back); Taskmaster, Mercenary Mimic's first-main-phase target, a creature
// card from Ana's graveyard through "From a graveyard", or a creature on the battlefield.
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, passTo, resolveUntil } from "./ui";

test("Havengul Laboratory: three Clues sacrificed, it transforms at your end step; pick Grizzly Bears; Murder it and it transforms back", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: ["Swamp", "Swamp", "Swamp", "Havengul Laboratory // Havengul Mystery"], yard: ["Grizzly Bears", "Shock"] });
  const [lab, bears, shock] = [one(s, "Havengul Laboratory"), one(s, "Grizzly Bears"), one(s, "Shock")];
  // Three Clues sacrificed earlier this turn (CR 701.21a).
  s.turnLog = { ...(s.turnLog ?? {}), sacrificed: [0, 1, 2].map(() => ({ player: 0, types: ["Artifact"], subtypes: ["Clue"], token: true as const })) } as GameState["turnLog"];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.step === "end", 60);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  const back = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(back.objects[lab]!.face).toBe(1);
  // On to your next turn's first main phase, with Havengul Mystery still face up.
  const main = await passTo(page, "main1", back.turn + 4);
  expect(main.objects[lab]!.face).toBe(1);
  await card(page, "Murder", main).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard" && st.objects[lab]!.face !== 1);
  expect(after.objects[lab]!.zone).toBe("battlefield");
  expect(after.log.some((l) => /Havengul Mystery transforms|transforms into Havengul Laboratory/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

test("Taskmaster, Mercenary Mimic: at your first main phase, pick Ana's Serra Angel card from her graveyard; he's a legendary 4/4 flier named Taskmaster", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Taskmaster, Mercenary Mimic"] }, [{ yard: ["Serra Angel", "Shock"] }], { step: "upkeep" });
  const [tm, angel, shock] = [one(s, "Taskmaster, Mercenary Mimic"), one(s, "Serra Angel"), one(s, "Shock")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("creature on the battlefield or creature card in a graveyard");
  await bar.getByRole("button", { name: "From a graveyard" }).click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${angel}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${angel}"]`).click();
  if (await bar.getByRole("button", { name: "Done" }).count()) await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && ch(st, tm).keywords.includes("Flying"));
  const c = ch(after, tm);
  expect(c.name).toBe("Taskmaster, Mercenary Mimic");
  expect(c.types).toEqual(["Creature"]);
  expect([...c.subtypes].sort()).toEqual(["Human", "Mercenary", "Villain"]);
  expect(c.supertypes).toContain("Legendary");
  expect(after.objects[angel]!.zone).toBe("graveyard");
  await expect(page.locator(`[data-obj="${tm}"]`).first()).toContainText("4/4");
  expect(pageErrors(page)).toEqual([]);
});

test("Taskmaster, Mercenary Mimic: target Ana's Ornithopter on the battlefield; he isn't an artifact", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Taskmaster, Mercenary Mimic"] }, [{ board: ["Ornithopter"] }], { step: "upkeep" });
  const [tm, thop] = [one(s, "Taskmaster, Mercenary Mimic"), one(s, "Ornithopter")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const bar = page.locator(".targeting");
  await page.locator(`[data-obj="${thop}"]`).first().click();
  if (await bar.getByRole("button", { name: "Done" }).count()) await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && ch(st, tm).keywords.includes("Flying"));
  expect(ch(after, tm).types).toEqual(["Creature"]);
  expect(ch(after, tm).name).toBe("Taskmaster, Mercenary Mimic");
  await expect(page.locator(`[data-obj="${tm}"]`).first()).toContainText("0/2");
  expect(pageErrors(page)).toEqual([]);
});
