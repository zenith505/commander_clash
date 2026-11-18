// Round 403 in the browser: Capricopian's ability on Ana's attacking creature, from its menu (only the player it
// attacks may activate it), then the player it attacks now; Archelos, Lagoon Mystic's "Enter untapped" / "Enter tapped"
// choice for a land that enters tapped; Wizard's Spellbook's 10—19 row, its copy cast for {1}.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Capricopian: Ana's Capricopian attacks you; pay {2} from its menu, then send it at Ben", async ({ page }) => {
  const s0 = scene({ board: [...LANDS] }, [{ board: ["Capricopian"] }]);
  const capri = one(s0, "Capricopian");
  s0.objects[capri]!.counters["+1/+1"] = 2;
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: capri, defender: 0 }] });
  s = playUntil(s, (st) => !st.pending && waitingOn(st) === 0 && st.step === "declareAttackers");
  await open(page, s);
  await card(page, "Capricopian", s).click();
  await menu(page).locator("button", { hasText: "reselect which player Capricopian is attacking" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "reselectAttack" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose what Capricopian attacks now");
  await expect(bar.getByRole("button", { name: /^Keep attacking/ })).toBeVisible();
  // Never Ana, its controller (CR 506.2).
  await expect(bar.getByRole("button", { name: "Ana", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[capri]!.attacking === 2);
  expect(after.objects[capri]!.counters["+1/+1"]).toBe(3);
  expect(after.objects[capri]!.attacked?.players).toEqual([0]);
  expect(pageErrors(page)).toEqual([]);
});

for (const [button, tapped] of [["Enter tapped", true], ["Enter untapped", false]] as const) {
  test(`Archelos, Lagoon Mystic: untapped, play Dimir Guildgate and choose "${button}"`, async ({ page }) => {
    const s = scene({ hand: ["Dimir Guildgate"], board: ["Archelos, Lagoon Mystic"] });
    const gate = one(s, "Dimir Guildgate");
    await open(page, s);
    await card(page, "Dimir Guildgate", s).click();
    const bar = controls(page);
    await expect(bar).toContainText("choose which applies last");
    await expect(bar.getByRole("button", { name: "Enter untapped" })).toBeVisible();
    await bar.getByRole("button", { name: button }).click();
    const after = await resolveUntil(page, (st) => !st.pending && st.objects[gate]!.zone === "battlefield");
    expect(after.objects[gate]!.tapped).toBe(tapped);
    expect(pageErrors(page)).toEqual([]);
  });
}

test("Wizard's Spellbook: exile Ana's Divination, roll 10—19, cast the copy for {1}", async ({ page }) => {
  const s0: GameState = scene({ board: [...LANDS, "Wizard's Spellbook"] }, [{ yard: ["Divination"] }]);
  const [book, div] = [one(s0, "Wizard's Spellbook"), one(s0, "Divination")];
  const plan = planActivate(s0, 0, book, 0, [{ kind: "object", id: div }]);
  expect(plan).not.toBeNull();
  const s1 = plan!.reduce((x, a) => applyAction(x, a), s0);
  // The die is the game's seeded one: start it where this roll is 10—19.
  let s: GameState | undefined;
  for (let k = 0; k < 200 && !s; k++) {
    const t = structuredClone(s1);
    t.rngState = k * 7919;
    const r = playUntil(t, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
    const roll = Number(/rolls a d20 for Wizard's Spellbook: (\d+)/.exec(r.log.map((l) => l.text).join("\n"))?.[1]);
    if (roll >= 10 && roll <= 19) s = r;
  }
  await open(page, s!);
  const bar = controls(page);
  await expect(bar).toContainText("by paying {1} rather than paying its mana cost?");
  await bar.getByRole("button", { name: "Divination" }).click();
  await expect(bar).toContainText("by paying {1} rather than paying its mana cost? Only now.");
  const hand = s!.players[0]!.hand.length;
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 2);
  expect(after.objects[div]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
