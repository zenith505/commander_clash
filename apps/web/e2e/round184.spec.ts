// Round 184's prompt: damage to "that player or a planeswalker that player controls" (Vial Smasher the Fierce, Curse of
// the Pierced Heart): as it resolves, a button for the player and one for each of their planeswalkers.
import { expect, test } from "@playwright/test";
import type { GameState, PlayerId } from "@cc/engine";
import { LANDS, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

const NAMES = ["You", "Ana", "Ben", "Cy"];
/** Vial Smasher on your side; each opponent has a Jace Beleren with 3 loyalty. */
const setting = () => {
  const s = scene({ hand: ["Sol Ring"], board: [...LANDS, "Vial Smasher the Fierce"] }, [{ board: ["Jace Beleren"] }, { board: ["Jace Beleren"] }, { board: ["Jace Beleren"] }]);
  for (const pid of [1, 2, 3] as PlayerId[]) s.objects[jaceOf(s, pid)]!.counters.loyalty = 3;
  return s;
};
const jaceOf = (s: GameState, pid: PlayerId) => s.battlefield.find((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Jace Beleren")!;

for (const pick of ["planeswalker", "player"] as const)
  test(`Vial Smasher the Fierce: the damage goes to the chosen ${pick}`, async ({ page }) => {
    const s = setting();
    await open(page, s);
    await card(page, "Sol Ring", s).click();
    const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageWhom");
    if (asked.pending?.kind !== "chooseOption") throw new Error("no question");
    // The opponent chosen at random, and their planeswalker.
    const who = Number(asked.pending.options[0]!.slice(1)) as PlayerId;
    const jace = jaceOf(asked, who);
    expect(asked.pending.options).toEqual([`p${who}`, jace]);
    const loyalty = asked.objects[jace]!.counters.loyalty ?? 0;
    const life = asked.players[who]!.life;
    const bar = controls(page);
    await expect(bar).toContainText(`deal the damage to ${NAMES[who]} or a planeswalker they control`);
    await bar.getByRole("button", { name: pick === "player" ? NAMES[who]! : "Jace Beleren", exact: true }).click();
    const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
    // Sol Ring's mana value is 1.
    expect(after.objects[jace]!.counters.loyalty ?? 0).toBe(pick === "planeswalker" ? loyalty - 1 : loyalty);
    expect(after.players[who]!.life).toBe(pick === "player" ? life - 1 : life);
    expect(pageErrors(page)).toEqual([]);
  });
