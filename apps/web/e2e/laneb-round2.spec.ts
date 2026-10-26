// Lane B round 2's prompts: Plow Under (the owner orders the two lands on top of their library) and Mold Demon
// ("sacrifice it unless you sacrifice two Swamps").
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Plow Under on two of your lands: you put them on top of your library in the order you choose", async ({ page }) => {
  const s0 = scene({ board: [...LANDS], hand: ["Plow Under"] }, [{ board: ["Forest"] }]);
  const [f1, f2] = idsOf(s0, "Forest", "battlefield", 0);
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Plow Under"), [{ kind: "object", id: f1! }, { kind: "object", id: f2! }])));
  expect(s.pending).toMatchObject({ kind: "orderLibrary", player: 0 });
  const start = s.pending?.kind === "orderLibrary" ? s.pending.cards : [];
  expect(new Set(start)).toEqual(new Set([f1, f2]));
  await open(page, s);
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Plow Under");
  // Move the second card toward the top: it goes on top.
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${start[1]}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[f1!]!.zone === "library");
  expect(after.players[0]!.library.slice(0, 2)).toEqual([start[1], start[0]]);
  expect(pageErrors(page)).toEqual([]);
});

test("Mold Demon: Yes, then the two Swamps you pick are sacrificed and it stays", async ({ page }) => {
  // Three lands with the Swamp type, each its own pile on the battlefield.
  const SWAMPS = ["Swamp", "Snow-Covered Swamp", "Bayou"];
  const s0 = scene({ board: ["Plains", "Plains", "Island", "Island", "Mountain", ...SWAMPS], hand: ["Mold Demon"] });
  const demon = one(s0, "Mold Demon");
  const s = passToPrompt(run(s0, planCast(s0, 0, demon)));
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Sacrifice two Swamps to keep Mold Demon");
  await bar.getByRole("button", { name: "Yes" }).click();
  // Three of them: you pick which two.
  await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  const [a, b, c] = SWAMPS.map((n) => idsOf(s, n, "battlefield", 0)[0]);
  await page.locator(`[data-obj="${a}"]`).click();
  await page.locator(`[data-obj="${c}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[a!]!.zone === "graveyard");
  expect([demon, a, b, c].map((id) => after.objects[id!]!.zone)).toEqual(["battlefield", "graveyard", "battlefield", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
