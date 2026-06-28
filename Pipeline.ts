import "dotenv/config";
import { GmailClient } from "./GmailClient.ts";
import { ClassificationAgent, FundingExtractionAgent, RankingAgent, ReportAgent, RetrievalAgent, SourceAgent } from "./src/agents.ts";
import type { Article, ReportOutput } from "./src/types.ts";

export type PipelineRunInput = {
  trigger?: "scheduled" | "manual";
};

type NewsletterDelivery = {
  messageId: string;
  response: string;
};

export type PipelineRunOutput = {
  report: ReportOutput;
  processedArticles: Article[];
  delivery: NewsletterDelivery | null;
};

function newsletterRecipients(): string | string[] | null {
  const recipient = process.env.NEWSLETTER_RECIPIENT?.trim();

  if (!recipient) {
    return null;
  }

  const recipients = recipient
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return recipients.length > 1 ? recipients : recipients[0] ?? null;
}

export class Pipeline {
  async run(input: PipelineRunInput = {}): Promise<PipelineRunOutput> {
    await SourceAgent.initialize?.();
    const articles = await SourceAgent.process({
      sources: ["https://feeds.bbci.co.uk/news/rss.xml"]
    });
    await SourceAgent.finalize?.();

    await RetrievalAgent.initialize?.();
    const filteredArticles = await RetrievalAgent.process(articles);
    await RetrievalAgent.finalize?.();

    await FundingExtractionAgent.initialize?.();
    const fundedArticles = await FundingExtractionAgent.process(filteredArticles);
    await FundingExtractionAgent.finalize?.();

    await ClassificationAgent.initialize?.();
    const classifiedArticles = await ClassificationAgent.process(fundedArticles);
    await ClassificationAgent.finalize?.();

    await RankingAgent.initialize?.();
    const processedArticles = await RankingAgent.process(classifiedArticles);
    await RankingAgent.finalize?.();

    await ReportAgent.initialize?.();
    const report = await ReportAgent.process(processedArticles);
    await ReportAgent.finalize?.();

    const delivery = await this.deliverNewsletter(report);

    return {
      report,
      processedArticles,
      delivery
    };
  }

  private async deliverNewsletter(report: ReportOutput): Promise<NewsletterDelivery | null> {
    const to = newsletterRecipients();

    if (!to) {
      console.log(JSON.stringify(report, null, 2));
      return null;
    }

    const gmailClient = new GmailClient();
    const delivery = await gmailClient.sendNewsletter({
      to,
      subject: report.subject,
      html: report.html,
      text: report.text
    });

    console.log(JSON.stringify(delivery, null, 2));
    return delivery;
  }
}

export async function runPipeline(input?: PipelineRunInput): Promise<PipelineRunOutput> {
  return new Pipeline().run(input);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runPipeline();
}
