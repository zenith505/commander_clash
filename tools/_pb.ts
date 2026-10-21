import { parseBody } from "../packages/engine/src/oracle/body";
const opts = JSON.parse(process.env.OPTS ?? "{}");
for (const t of process.argv.slice(2)) console.log(t, "=>", JSON.stringify(parseBody(t, opts)));
