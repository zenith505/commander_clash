// Lane B round 33 in the browser: Warlord's Elite's "tap two untapped artifacts, creatures, and/or lands you control" as
// it's cast (the lands clicked aren't also tapped for its mana), Flowstone Sculpture's choice of a +1/+1 counter or a
// keyword, and Walking Sponge's "loses your choice of flying, first strike, or trample".
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Warlord's Elite: click an Island and a Swamp to tap, and the other three lands pay {2}{W}", async ({ page }) => {
  // Differently named lands, so each can be clicked.
  const s = scene({ board: ["Plains", "Island", "Swamp", "Mountain", "Forest"], hand: ["Warlord's Elite"] });
  const elite = one(s, "Warlord's Elite");
  const lands = ["Plains", "Island", "Swamp", "Mountain", "Forest"].map((n) => idsOf(s, n, "battlefield", 0)[0]!);
  await open(page, s);
  await card(page, "Warlord's Elite", s).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("tap 2 untapped artifacts, creatures, and/or lands you control");
  await page.locator(`[data-obj="${lands[1]}"]`).first().click();
  await page.locator(`[data-obj="${lands[2]}"]`).first().click();
  await costBar.getByRole("button", { name: "Tap and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[elite]!.zone === "battlefield");
  expect(lands.map((id) => after.objects[id]!.tapped)).toEqual([true, true, true, true, true]);
  expect(pageErrors(page)).toEqual([]);
});

test("Flowstone Sculpture: discard a card, then choose trample over a +1/+1 counter", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Flowstone Sculpture"], hand: ["Grizzly Bears"] });
  const [sculpture, bears] = [one(s0, "Flowstone Sculpture"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planActivate(s0, 0, sculpture, 0, [], undefined, undefined, undefined, { discard: [bears] })));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", player: 0 });
  await open(page, s);
  const bar = controls(page);
  for (const label of ["Put a +1/+1 counter on it", "It gains flying", "It gains first strike", "It gains trample"]) await expect(bar.getByRole("button", { name: label })).toBeVisible();
  await bar.getByRole("button", { name: "It gains trample" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const gained = after.effects.filter((e) => e.affected.includes(sculpture)).flatMap((e) => e.mods);
  expect(gained).toContainEqual({ kind: "addKeywords", keywords: ["Trample"] });
  expect(after.objects[sculpture]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Walking Sponge: Serra Angel loses flying, the keyword chosen as it resolves", async ({ page }) => {
  const s0 = scene({ board: ["Walking Sponge"] }, [{ board: ["Serra Angel"] }]);
  const [sponge, angel] = [one(s0, "Walking Sponge"), one(s0, "Serra Angel")];
  const s = passToPrompt(run(s0, planActivate(s0, 0, sponge, 0, [{ kind: "object", id: angel }])));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "keyword", player: 0 });
  await open(page, s);
  const bar = controls(page);
  for (const k of ["Flying", "First strike", "Trample"]) await expect(bar.getByRole("button", { name: k })).toBeVisible();
  await bar.getByRole("button", { name: "Flying" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const lost = after.effects.filter((e) => e.affected.includes(angel)).flatMap((e) => e.mods);
  expect(lost).toContainEqual({ kind: "removeKeywords", keywords: ["Flying"] });
  expect(pageErrors(page)).toEqual([]);
});
