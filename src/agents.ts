import type { AgentLifecycle, Article, ReportOutput, RetrievedArticle } from "./types.ts";
import { SourceAgent as runSourceAgent } from "../SourceAgent.ts";
import { RetrievalAgent as runRetrievalAgent } from "../RetrievalAgent.ts";
import { FundingExtractionAgent as runFundingExtractionAgent } from "../FundingExtractionAgent.ts";
import { ClassificationAgent as runClassificationAgent } from "../ClassificationAgent.ts";
import { RankingAgent as runRankingAgent } from "../RankingAgent.ts";
import { ReportAgent as runReportAgent } from "../ReportAgent.ts";

export const SourceAgent: AgentLifecycle<{ sources: string[] }, Article[]> = {
  name: "SourceAgent",
  process: async (input) => {
    const output = await runSourceAgent(input);
    return output.articles;
  }
};

export const RetrievalAgent: AgentLifecycle<Article[], RetrievedArticle[]> = {
  name: "RetrievalAgent",
  process: async (articles) => {
    const output = await runRetrievalAgent({ articles });
    return output.articles;
  }
};

export const FundingExtractionAgent: AgentLifecycle<RetrievedArticle[], Article[]> = {
  name: "FundingExtractionAgent",
  process: async (articles) => {
    const output = await runFundingExtractionAgent({ articles });
    return output.articles;
  }
};

export const ClassificationAgent: AgentLifecycle<Article[], Article[]> = {
  name: "ClassificationAgent",
  process: async (articles) => {
    const output = await runClassificationAgent({ articles });
    return output.articles;
  }
};

export const RankingAgent: AgentLifecycle<Article[], Article[]> = {
  name: "RankingAgent",
  process: async (articles) => {
    const output = await runRankingAgent({ articles });
    return output.articles;
  }
};

export const ReportAgent: AgentLifecycle<Article[], ReportOutput> = {
  name: "ReportAgent",
  process: async (articles) => {
    return runReportAgent({ articles });
  }
};
