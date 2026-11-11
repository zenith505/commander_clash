// Round 337's prompts: Frontline Heroism with a token doubler (the copy of your spell targets one of the two Soldier
// tokens, your choice, CR 707.10e) and Hunted by The Family cast by an opponent (you face a villainous choice about each
// creature of yours it targets).
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planCast, power, toughness } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Frontline Heroism with Anointed Procession: Giant Growth on Grizzly Bears, then pick the Soldier the copy targets", async ({ page }) => {
  const s = scene({ hand: ["Giant Growth"], board: [...LANDS, "Frontline Heroism", "Anointed Procession", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Giant Growth", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyOrder" && st.pending.player === 0);
  const tokens = asked.pending?.kind === "chooseOption" ? asked.pending.options : [];
  expect(tokens).toHaveLength(2);
  await expect(controls(page)).toContainText("choose the token the copy of Giant Growth targets");
  await controls(page).getByRole("button", { name: "Soldier Token 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && power(st, st.objects[bears]!) === 5);
  const [first, second] = tokens as [string, string];
  expect(`${power(after, after.objects[second]!)}/${toughness(after, after.objects[second]!)}`).toBe("4/4");
  expect(`${power(after, after.objects[first]!)}/${toughness(after, after.objects[first]!)}`).toBe("1/1");
  expect(pageErrors(page)).toEqual([]);
});

test("Hunted by The Family cast by Ana: you face a villainous choice about Serra Angel and hand her a copy", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Serra Angel"] }, [{ hand: ["Hunted by The Family"], board: LANDS }]);
  const angel = one(s0, "Serra Angel");
  const [hunted] = idsOf(s0, "Hunted by The Family", "hand", 1);
  let s = playUntil(s0, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && st.stack.length === 0);
  for (const a of planCast(s, 1, hunted!, [{ kind: "object", id: angel }, { kind: "none" }, { kind: "none" }, { kind: "none" }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "villainous" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", about: angel });
  await open(page, s);
  await expect(controls(page)).toContainText("Hunted by The Family: you face a villainous choice about Serra Angel");
  await expect(controls(page).getByRole("button", { name: "That creature becomes a 1/1 white Human creature and loses all abilities" })).toBeVisible();
  await controls(page).getByRole("button", { name: "You create a token that's a copy of it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 1));
  const copy = after.battlefield.find((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 1)!;
  expect(characteristics(after, after.objects[copy]!).name).toBe("Serra Angel");
  expect(power(after, after.objects[angel]!)).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});
