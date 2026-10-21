import { parseTrigger } from "../packages/engine/src/oracle/triggers";
for (const t of process.argv.slice(2)) console.log(JSON.stringify(parseTrigger(t)));
