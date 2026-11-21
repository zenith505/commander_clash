// Lane B round B284 in the browser: Tahngarth, First Mate (Ana attacks you and Ben; you say yes, pick Ben, and Tahngarth
// attacks Ben for Ana until end of combat) and Chorus of the Conclave (cast Grizzly Bears paying {3} more: it enters with
// three +1/+1 counters).
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Tahngarth, First Mate: Ana attacks you and Ben; you lend it to her, and it attacks Ben", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Tahngarth, First Mate"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [tg, bears, giant] = [one(s, "Tahngarth, First Mate"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[tg]!.tapped = true;
  // Ana's turn: she declares the Bears at you and the Giant at Ben.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: bears, defender: 0 }, { attacker: giant, defender: 2 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Tahngarth, First Mate: You may have that opponent gain control of Tahngarth, First Mate until end of combat.");
  await expect(bar).toContainText("Tahngarth, First Mate is attacking that player or planeswalker?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom" && st.pending.player === 0);
  await expect(bar).toContainText("choose what Tahngarth, First Mate attacks for Ana");
  await expect(bar.getByRole("button", { name: "You", exact: true })).toHaveCount(1);
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await settled(page, (st) => !(st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom") && st.objects[tg]!.attacking === 2);
  expect(controllerOf(after, after.objects[tg]!)).toBe(1);
  expect(after.objects[tg]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Chorus of the Conclave: cast Grizzly Bears paying {3} more; it enters with three +1/+1 counters", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Chorus of the Conclave"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const pick = page.locator(".targeting");
  await expect(pick).toContainText("Grizzly Bears: as an additional cost (Chorus of the Conclave), you may pay any amount of mana");
  await pick.locator('[data-number="3"]').click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(3);
  // {1}{G} and {3}.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(5);
  expect(pageErrors(page)).toEqual([]);
});
