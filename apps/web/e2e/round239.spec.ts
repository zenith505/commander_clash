// Round 239 in the browser: Abundant Harvest's "Choose land or nonland. Reveal cards from the top of your library until
// you reveal a card of the chosen kind. Put that card into your hand and the rest on the bottom of your library in a
// random order." A Land / Nonland button pair as it resolves.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
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

for (const [pick, want] of [["Land", "Forest"], ["Nonland", "Grizzly Bears"]] as const) {
  test(`Abundant Harvest: choose ${pick}, and the first ${pick.toLowerCase()} card revealed goes to your hand`, async ({ page }) => {
    const s0 = scene({ board: LANDS, hand: ["Abundant Harvest"], library: ["Grizzly Bears", "Forest", "Serra Angel"] });
    const harvest = one(s0, "Abundant Harvest");
    // The three cards named are the top of the library, in that order (the board's Forests are elsewhere).
    const [bears, forest, angel] = s0.players[0]!.library.slice(0, 3) as [string, string, string];
    expect([bears, forest, angel].map((id) => s0.cards[s0.objects[id]!.cardId]!.name)).toEqual(["Grizzly Bears", "Forest", "Serra Angel"]);
    const s = passToPrompt(run(s0, planCast(s0, 0, harvest)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "landOrNonland" });
    await open(page, s);
    const bar = controls(page);
    await expect(bar).toContainText("choose land or nonland");
    await bar.getByRole("button", { name: pick, exact: true }).click();
    const after = await resolveUntil(page, (st) => !st.pending && st.objects[harvest]!.zone === "graveyard");
    const zone = (id: string) => after.objects[id]!.zone;
    if (pick === "Land") {
      expect(zone(forest)).toBe("hand");
      // Grizzly Bears was revealed first and goes to the bottom; Serra Angel was never revealed and is now on top.
      const lib = after.players[0]!.library;
      expect([lib[0], lib[lib.length - 1]]).toEqual([angel, bears]);
    } else {
      expect(zone(bears)).toBe("hand");
      // Grizzly Bears was the first card revealed: nothing else moves, and Forest is on top.
      expect(after.players[0]!.library.slice(0, 2)).toEqual([forest, angel]);
    }
    expect(after.cards[after.objects[pick === "Land" ? forest : bears]!.cardId]!.name).toBe(want);
    expect(pageErrors(page)).toEqual([]);
  });
}
