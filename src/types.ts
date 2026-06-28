import type { Organization } from "../OrganizationService.ts";

export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  date: string;
  language: string;
  text: string;
  retrieval: {
    keywordScore: number;
    orgScore: number;
    semanticScore: number;
    relevanceScore: number;
    matchedOrganizations: Organization[];
  };
  funding: {
    sponsor: string | null;
    deadlineRaw: string | null;
    deadlineIso: string | null;
    daysUntilDeadline: number | null;
    urgencyLevel: "high" | "medium" | "normal" | "unknown";
    amountRaw: string | null;
    amountValue: number | null;
    currency: string | null;
    isSmallProject: boolean | null;
    eligibleForBurundi: boolean | null;
    eligibleRegions: string[];
  };
  classification: {
    categories: string[];
    subcategories: string[];
  };
  ranking: {
    fundingScore: number;
    urgencyScore: number;
    finalScore: number;
    finalRank: number | null;
  };
};

export type RetrievedArticle = Article & {
  retrieval: Article["retrieval"];
};

export type ReportOutput = {
  subject: string;
  html: string;
  text: string;
  articlesUsed: Article[];
};

export type PipelineContext = {
  articles: Article[];
  filteredArticles: RetrievedArticle[];
  fundedArticles: Article[];
  classifiedArticles: Article[];
  rankedArticles: Article[];
  report: ReportOutput;
};

export type AgentLifecycle<TInput, TOutput> = {
  name: string;
  initialize?: () => Promise<void> | void;
  process: (input: TInput) => Promise<TOutput> | TOutput;
  finalize?: () => Promise<void> | void;
};
