import Parser from "rss-parser";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import type { Article } from "./src/types.ts";

type SourceAgentInput = {
  sources: string[];
};

type SourceAgentOutput = {
  articles: Article[];
};

type FeedItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  creator?: string;
  guid?: string;
  description?: string;
};

const parser = new Parser<FeedItem>();

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function detectLanguage(text: string): string {
  const sample = text.toLowerCase();

  if (/[äöüß]/.test(sample) || /\b(und|der|die|das|für|mit|nicht|ist|ein|eine)\b/.test(sample)) {
    return "de";
  }

  return "en";
}

function createEmptyRetrieval(): Article["retrieval"] {
  return {
    keywordScore: 0,
    orgScore: 0,
    semanticScore: 0,
    relevanceScore: 0,
    matchedOrganizations: []
  };
}

function createEmptyFunding(): Article["funding"] {
  return {
    sponsor: null,
    deadlineRaw: null,
    deadlineIso: null,
    daysUntilDeadline: null,
    urgencyLevel: "unknown",
    amountRaw: null,
    amountValue: null,
    currency: null,
    isSmallProject: null,
    eligibleForBurundi: null,
    eligibleRegions: []
  };
}

function createEmptyClassification(): Article["classification"] {
  return {
    categories: [],
    subcategories: []
  };
}

function createEmptyRanking(): Article["ranking"] {
  return {
    fundingScore: 0,
    urgencyScore: 0,
    finalScore: 0,
    finalRank: null
  };
}

function createArticle(base: {
  id: string;
  title: string;
  url: string;
  source: string;
  date: string;
  language: string;
  text: string;
}): Article {
  return {
    ...base,
    retrieval: createEmptyRetrieval(),
    funding: createEmptyFunding(),
    classification: createEmptyClassification(),
    ranking: createEmptyRanking()
  };
}

async function extractArticleText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "mutagent-helix-source-agent/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article HTML: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const candidates = [
    "article",
    "main",
    '[role="main"]',
    ".post-content",
    ".article-content",
    ".entry-content",
    ".content"
  ];

  for (const selector of candidates) {
    const text = normalizeText($(selector).first().text());
    if (text.length > 200) {
      return text;
    }
  }

  const bodyText = normalizeText($("body").text());
  return bodyText;
}

async function sourceFeed(feedUrl: string): Promise<Article[]> {
  const feed = await parser.parseURL(feedUrl);
  const feedTitle = feed.title ?? feedUrl;
  const items = (feed.items ?? []).slice(0, 5);

  const articles: Article[] = [];

  for (const item of items) {
    const url = item.link ?? item.guid ?? feedUrl;
    const title = item.title ?? "Untitled article";
    const publishedDate = item.isoDate ?? item.pubDate ?? new Date().toISOString();
    const fallbackText = normalizeText(item.contentSnippet ?? item.description ?? item.content ?? "");

    let text = fallbackText;

    try {
      const extracted = await extractArticleText(url);
      if (extracted.length > 0) {
        text = extracted;
      }
    } catch {
      if (!text) {
        text = fallbackText;
      }
    }

    articles.push(
      createArticle({
        id: hashUrl(url),
        title,
        url,
        source: feedTitle,
        date: publishedDate,
        language: detectLanguage(`${title} ${text}`),
        text: text || fallbackText
      })
    );
  }

  return articles;
}

export async function SourceAgent(input: SourceAgentInput): Promise<SourceAgentOutput> {
  const sources = Array.from(new Set(input.sources.filter(Boolean)));
  const collected: Article[] = [];

  for (const source of sources) {
    const feedArticles = await sourceFeed(source);
    collected.push(...feedArticles);
  }

  return { articles: collected };
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  const input: SourceAgentInput = raw
    ? JSON.parse(raw)
    : {
        sources: ["https://feeds.bbci.co.uk/news/rss.xml"]
      };

  const output = await SourceAgent(input);
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
