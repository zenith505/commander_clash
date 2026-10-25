import { compileCard, isFullySupported, parseTypeLine, type CardDef } from "../packages/engine/src";
const [name, typeLine, text, cost, pow, tou] = process.argv.slice(2);
const d: CardDef = { oracleId: "x", name: name!, manaCost: cost ?? "", cmc: 0, typeLine: typeLine!, ...parseTypeLine(typeLine!), oracleText: text!.replace(/\\n/g, "\n"), colors: [], colorIdentity: [], keywords: [], ...(pow ? { power: pow, toughness: tou } : {}) };
const c = compileCard(d);
console.log("supported:", isFullySupported(d), "unsupported:", c.unsupported);
if (process.env.V) console.log(JSON.stringify({ triggers: c.triggers, activated: c.activated, statics: c.statics, spell: c.spell }, null, 1).slice(0, Number(process.env.V)));
