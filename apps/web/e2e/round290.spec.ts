// Round 290's prompt: Chaotic Transformation exiles two of your permanents, and you choose which one to reveal for first
// (rulings: a player with several chooses the order), then each finds a card that shares a card type with it.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Chaotic Transformation: choose which exiled permanent to reveal for first; each finds a card sharing a card type", async ({ page }) => {
  let s = scene({ hand: ["Chaotic Transformation"], board: ["Sol Ring", "Grizzly Bears", ...LANDS], library: ["Mind Stone", "Llanowar Elves"] });
  const [ring, bears] = [one(s, "Sol Ring"), one(s, "Grizzly Bears")];
  const none = { kind: "none" } as const;
  const plan = planCast(s, 0, one(s, "Chaotic Transformation"), [{ kind: "object", id: ring }, { kind: "object", id: bears }, none, none, none]);
  expect(plan).not.toBeNull();
  for (const a of plan!) s = applyAction(s, a);
  s = passToPrompt(s);
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "nextExiled", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Chaotic Transformation:");
  await expect(bar).toContainText("choose the exiled permanent to reveal for next");
  await expect(bar.getByRole("button", { name: "Grizzly Bears" })).toBeVisible();
  await bar.getByRole("button", { name: "Sol Ring" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[ring]!.zone).toBe("exile");
  expect(after.objects[bears]!.zone).toBe("exile");
  // Sol Ring found the Mind Stone on top; after the shuffle, Grizzly Bears found the only creature card, the Elves.
  expect(idsOf(after, "Mind Stone", "battlefield", 0).length).toBe(1);
  expect(idsOf(after, "Llanowar Elves", "battlefield", 0).length).toBe(1);
  const i = after.log.findIndex((l) => l.text.includes("Mind Stone"));
  const j = after.log.findIndex((l) => l.text.includes("Llanowar Elves"));
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  expect(pageErrors(page)).toEqual([]);
});
