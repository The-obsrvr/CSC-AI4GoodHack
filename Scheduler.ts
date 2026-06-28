import "dotenv/config";
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { Pipeline } from "./Pipeline.ts";

const NEWSLETTER_CRON = "0 5,10,15,20 * * *";
const TIMEZONE = "Africa/Bujumbura";

export function startScheduler(): ScheduledTask {
  return cron.schedule(
    NEWSLETTER_CRON,
    async () => {
      const pipeline = new Pipeline();
      await pipeline.run({ trigger: "scheduled" });
    },
    {
      timezone: TIMEZONE
    }
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startScheduler();
}
