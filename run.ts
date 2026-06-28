import { Pipeline } from "./Pipeline.ts";

async function main(): Promise<void> {
  console.log("Starting manual newsletter pipeline run...");

  try {
    const pipeline = new Pipeline();
    const result = await pipeline.run({ trigger: "manual" });

    console.log("Newsletter pipeline completed successfully.");
    console.log(
      JSON.stringify(
        {
          subject: result.report.subject,
          processedArticles: result.processedArticles.length,
          emailSent: result.delivery !== null,
          messageId: result.delivery?.messageId ?? null
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("Newsletter pipeline failed.");

    if (error instanceof Error) {
      console.error(error.stack ?? error.message);
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

await main();
