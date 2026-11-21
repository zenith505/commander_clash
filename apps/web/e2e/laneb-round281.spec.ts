// Lane B round B281 in the browser: Drain Power cast at yourself asks which mana ability of your Tundra you activate (its
// buttons name the mana), and the mana stays yours; with Celestial Dawn, a Forest (a Plains now) pays Lightning Bolt's {R}.
import { expect, test } from "@playwright/test";
import { idsOf, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";
import type { GameState } from "@cc/engine";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Drain Power at yourself: choose Tundra's {U}; then Battlefield Forge's {C}", async ({ page }) => {
  const s = scene({ hand: ["Drain Power"], board: ["Tundra", "Battlefield Forge"] });
  // Drain Power's {U}{U} from the pool, so neither land is tapped to cast it.
  s.players[0]!.manaPool.U = 2;
  const [tundra, forge] = [idsOf(s, "Tundra", "battlefield", 0)[0]!, idsOf(s, "Battlefield Forge", "battlefield", 0)[0]!];
  await open(page, s);
  await card(page, "Drain Power", s).click();
  await clickPlayer(page, 0);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "drainLand" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Drain Power: choose the mana ability of Tundra you activate");
  await expect(bar.getByRole("button", { name: "Add {W}" })).toBeVisible();
  await bar.getByRole("button", { name: "Add {U}" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "drainLand" && st.pending.about === forge);
  await expect(bar).toContainText("choose the mana ability of Battlefield Forge you activate");
  await expect(bar.getByRole("button", { name: "Add {R} (1 damage to you)" })).toBeVisible();
  await bar.getByRole("button", { name: "Add {C}" }).click();
  const after = await settled(page, (x) => !x.pending && x.stack.length === 0 && x.objects[forge]!.tapped);
  expect(after.objects[tundra]!.tapped).toBe(true);
  expect(after.players[0]!.manaPool.U).toBe(1);
  expect(after.players[0]!.manaPool.C).toBe(1);
  expect(after.players[0]!.life).toBe(s.players[0]!.life);
  expect(pageErrors(page)).toEqual([]);
});

test("Celestial Dawn: a Forest is a Plains, and its {W} pays Lightning Bolt's {R}", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: ["Celestial Dawn", "Forest"] });
  const forest = idsOf(s, "Forest", "battlefield", 0)[0]!;
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 1);
  const after = await settled(page, (x) => !x.pending && x.stack.length === 0 && x.players[1]!.life === life - 3);
  expect(after.objects[forest]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
