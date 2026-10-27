// Lane B round 6's cards through existing prompts: Vex counters your spell, and you choose whether to draw a card.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** You cast Grizzly Bears; your opponent counters it with Vex, and it's your call whether to draw. */
function vexed(): { s: GameState; bears: string } {
  let s = scene({ hand: ["Grizzly Bears"], board: [...LANDS] }, [{ hand: ["Vex"], board: ["Island", "Island", "Island"] }]);
  const [bears, vex] = [one(s, "Grizzly Bears"), one(s, "Vex")];
  for (const a of planCast(s, 0, bears)!) s = applyAction(s, a);
  s = applyAction(s, { type: "passPriority", player: 0 });
  expect(waitingOn(s)).toBe(1);
  for (const a of planCast(s, 1, vex, [{ kind: "stack", id: s.stack.at(-1)!.id }])!) s = applyAction(s, a);
  for (let i = 0; i < 8 && !s.pending; i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, bears };
}

for (const yes of [true, false]) {
  test(`Vex: your spell is countered, and you ${yes ? "draw" : "don't draw"} a card`, async ({ page }) => {
    const { s, bears } = vexed();
    expect(s.pending).toMatchObject({ player: 0 });
    const hand = s.players[0]!.hand.length;
    await open(page, s);
    await controls(page).getByRole("button", { name: yes ? "Yes" : "No", exact: true }).click();
    const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
    expect(after.objects[bears]!.zone).toBe("graveyard");
    expect(after.players[0]!.hand.length).toBe(hand + (yes ? 1 : 0));
    expect(pageErrors(page)).toEqual([]);
  });
}
