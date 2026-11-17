// Lane B round B250's prompt: with an opponent's Gather Specimens in effect this turn, your Xantcha has two control-changing
// replacements as it enters, and you choose which applies first (CR 616.1b, rulings on Gather Specimens).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Gather Specimens and Xantcha: you click Ana's Gather Specimens first, then Ana chooses Xantcha's opponent", async ({ page }) => {
  const s = scene({ hand: ["Xantcha, Sleeper Agent"], board: LANDS });
  const xantcha = one(s, "Xantcha, Sleeper Agent");
  const ana = s.players.find((p) => p.name === "Ana")!.id;
  // Ana cast Gather Specimens earlier this turn: it resolved, and its replacement lasts until the turn ends.
  s.gatherSpecimens = [{ id: "g1", player: ana, turn: s.turn, source: "Gather Specimens" }];
  await open(page, s);
  await card(page, "Xantcha, Sleeper Agent", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "controlFirst");
  // How it enters waits for the choice.
  expect(asked.objects[xantcha]!.controller).toBe(0);
  const bar = controls(page);
  await expect(bar).toContainText("Xantcha, Sleeper Agent: which control-changing effect applies first?");
  await expect(bar.getByRole("button")).toHaveText(["Gather Specimens: Ana", "Xantcha, Sleeper Agent's own: an opponent of your choice"]);
  await bar.getByRole("button", { name: "Gather Specimens: Ana", exact: true }).click();
  // Under Ana's control, Xantcha's own replacement: Ana chooses one of her opponents; her Gather Specimens is used up.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[xantcha]!.zone === "battlefield" && st.log.some((l) => l.text.startsWith("Xantcha, Sleeper Agent enters under") && !l.text.endsWith("(Gather Specimens).")));
  expect(after.log.some((l) => l.text === "Xantcha, Sleeper Agent enters under Ana's control instead (Gather Specimens).")).toBe(true);
  expect(after.objects[xantcha]!.controller).not.toBe(ana);
  expect(pageErrors(page)).toEqual([]);
});
