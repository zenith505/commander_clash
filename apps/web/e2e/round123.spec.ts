// Round 123's prompts: the question what a token entering attacking attacks (CR 508.4) offers "All N attack ..." for
// the tokens still to ask about; Lightning Bolt at you with two redirections (Pariah, Palisade Giant) asks you which
// applies (CR 616.1), now for damage a spell deals too, not only combat damage.
import { expect, test } from "@playwright/test";
import { applyAction } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Hero of Bladehold: \"All 2 attack Ben\" answers for both Soldier tokens at once", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Hero of Bladehold"] }, [{}, {}]);
  const hero = one(s, "Hero of Bladehold");
  // The attack is played in the engine; the test starts at the first token's question.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: hero, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose what the Soldier token attacks (1 of 2)");
  await bar.getByRole("button", { name: "All 2 attack Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.battlefield.filter((id) => st.cards[st.objects[id]!.cardId]!.name === "Soldier Token").length === 2);
  const soldiers = after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Soldier Token");
  expect(soldiers.map((id) => after.objects[id]!.attacking)).toEqual([2, 2]);
  expect(pageErrors(page)).toEqual([]);
});

test("Lightning Bolt at you with Pariah and Palisade Giant: you choose which redirection applies", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Grizzly Bears", "Pariah", "Palisade Giant"] });
  const [bears, pariah, giant] = [one(s, "Grizzly Bears"), one(s, "Pariah"), one(s, "Palisade Giant")];
  s.objects[pariah]!.attachedTo = bears;
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 0);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield");
  await expect(controls(page)).toContainText("Damage to You: which shield applies first?");
  await expect(controls(page).getByRole("button", { name: "Deal it to Grizzly Bears instead (Pariah)" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Deal it to Palisade Giant instead (Palisade Giant)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.damage).toBe(3);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});
