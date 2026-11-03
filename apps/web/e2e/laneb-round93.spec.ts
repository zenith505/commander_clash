// Lane B round 93's choices in the browser: Juxtapose's tied creature with the greatest mana value, Teferi's Realm's
// card type at your upkeep, and Kudzu moved by the player whose land it destroyed.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
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

test("Juxtapose at Ana: choose Elvish Visionary of your two 2-mana-value creatures; it goes to Ana, her Hill Giant to you", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears", "Elvish Visionary"], hand: ["Juxtapose"] }, [{ board: ["Hill Giant"] }]);
  const [jux, bears, visionary, giant] = [one(s0, "Juxtapose"), one(s0, "Grizzly Bears"), one(s0, "Elvish Visionary"), one(s0, "Hill Giant")];
  const s = passToPrompt(run(s0, planCast(s0, 0, jux, [{ kind: "player", id: 1 }], undefined, "auto")));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "greatestTie" });
  await open(page, s);
  await expect(controls(page)).toContainText("choose which of your creatures with the greatest mana value (2) to exchange");
  await controls(page).getByRole("button", { name: "Elvish Visionary", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[jux]!.zone === "graveyard");
  expect([controllerOf(after, after.objects[visionary]!), controllerOf(after, after.objects[giant]!), controllerOf(after, after.objects[bears]!)]).toEqual([1, 0, 0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Teferi's Realm at your upkeep: choose Creature; your Grizzly Bears phases out, Glorious Anthem stays", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Teferi's Realm", "Glorious Anthem", "Grizzly Bears"] });
  const [bears, anthem] = [one(s0, "Grizzly Bears"), one(s0, "Glorious Anthem")];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0 && st.step === "upkeep");
  await open(page, s);
  await expect(controls(page)).toContainText("choose a card type");
  await expect(controls(page).getByRole("button", { name: "Non-Aura enchantment", exact: true })).toBeVisible();
  await controls(page).getByRole("button", { name: "Creature", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "phasedOut");
  expect(after.objects[anthem]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Kudzu destroys your tapped Forest; you move Kudzu to Ana's Snow-Covered Forest", async ({ page }) => {
  const s0 = scene({ board: LANDS }, [{ board: ["Kudzu", "Snow-Covered Forest"] }]);
  const [kudzu, snow] = [one(s0, "Kudzu"), one(s0, "Snow-Covered Forest")];
  const forest = idsOf(s0, "Forest", "battlefield", 0)[0]!;
  s0.objects[kudzu]!.attachedTo = forest;
  const s = passToPrompt(applyAction(s0, { type: "activateMana", player: 0, objectId: forest, mana: "G" }));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "enchant" });
  await open(page, s);
  await expect(controls(page)).toContainText("choose a land to attach Kudzu to, or none");
  await controls(page).getByRole("button", { name: "Snow-Covered Forest (Ana)", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[kudzu]!.attachedTo === snow);
  expect([after.objects[forest]!.zone, after.objects[kudzu]!.zone]).toEqual(["graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});
