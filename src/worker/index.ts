// Separate process: `npm run worker`. Runs anywhere Node + Postgres run (VM, container, PaaS worker dyno).
// Milestone 2 registers the event consumer, step scheduler and send workers here.
import { getBoss, stopBoss } from "../server/queue/boss.ts";
import { IMPORT_QUEUE, commitImportBatch } from "../server/imports/engine.ts";

const boss = await getBoss();
await boss.createQueue(IMPORT_QUEUE).catch(() => {});

await boss.work<{ importId: string }>(IMPORT_QUEUE, async (jobs) => {
  for (const job of jobs) {
    const { importId } = job.data;
    console.log(`[worker] committing import ${importId}`);
    let done = false;
    while (!done) {
      ({ done } = await commitImportBatch(importId));
    }
    console.log(`[worker] import ${importId} finished`);
  }
});

console.log(`[worker] pg-boss started; handling ${IMPORT_QUEUE}.`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => { await stopBoss(); process.exit(0); });
}