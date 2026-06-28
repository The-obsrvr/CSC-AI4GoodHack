import type { Article } from "./src/types.ts";
import { matchOrganizations } from "./OrganizationService.ts";
import type { Organization } from "./OrganizationService.ts";

type RetrievalAgentInput = {
  articles: Article[];
};

export type RetrievedArticle = Article & {
  retrieval: Article["retrieval"];
};

type RetrievalAgentOutput = {
  articles: RetrievedArticle[];
};

const KEYWORD_GROUPS = [
  ["Burundi", "Bujumbura", "Gitega", "Great Lakes", "East Africa", "Africa"],
  ["funding", "grant", "call for proposals", "application", "deadline", "award", "donor", "foundation"],
  ["development", "aid", "humanitarian", "ngo", "nonprofit", "civil society", "community"],
  ["health", "malaria", "cholera", "ebola", "rabies", "vaccine", "nutrition", "maternal", "child health"],
  ["education", "school", "training", "vocational", "youth", "children"],
  ["women", "gender", "girls", "gbv", "violence", "rights"],
  ["refugee", "migration", "displacement", "conflict", "security", "crisis"],
  ["climate", "agriculture", "food security", "livelihood", "rural", "water", "sanitation"],
  ["animal welfare", "livestock", "wildlife", "working animals", "donkey", "veterinary", "poaching"],
  ["policy", "government", "election", "economy", "poverty", "human rights"]
];

const GEOGRAPHIC_KEYWORDS = [
  "Burundi",
  "Bujumbura",
  "Gitega",
  "Great Lakes",
  "East Africa",
  "Central Africa",
  "Rwanda",
  "Tanzania",
  "Democratic Republic of Congo",
  "DRC",
  "Congo"
];

const FUNDING_KEYWORDS = [
  "funding",
  "grant",
  "call for proposals",
  "application",
  "deadline",
  "award",
  "donor",
  "foundation",
  "scholarship",
  "fellowship"
];

const SEMANTIC_REFERENCE =
  "Burundi and East Africa news, funding opportunities, development cooperation, humanitarian aid, health, education, gender equality, civil society, rural livelihoods, agriculture, animal welfare and human rights";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MIN_RELEVANCE_SCORE = 0.25;
const MIN_SEMANTIC_RELEVANCE_WITHOUT_SIGNAL = 0.35;

function normalize(value: string): string {
  return value.toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(text: string, keyword: string): boolean {
  const normalizedKeyword = normalize(keyword).trim();
  const escapedKeyword = normalizedKeyword.split(/\s+/).map(escapeRegExp).join("\\s+");
  const startsWithWord = /^[a-z0-9]/i.test(normalizedKeyword);
  const endsWithWord = /[a-z0-9]$/i.test(normalizedKeyword);
  const pattern = `${startsWithWord ? "\\b" : ""}${escapedKeyword}${endsWithWord ? "\\b" : ""}`;

  return new RegExp(pattern, "i").test(text);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let aMag = 0;
  let bMag = 0;

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }

  if (aMag === 0 || bMag === 0) {
    return 0;
  }

  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

async function fetchEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return [];
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  return data.data?.[0]?.embedding ?? [];
}

function keywordScore(article: Article): number {
  const text = normalize(`${article.title} ${article.text}`);
  const matches = KEYWORD_GROUPS.filter((group) =>
    group.some((keyword) => keywordMatches(text, keyword))
  ).length;

  return matches / KEYWORD_GROUPS.length;
}

function hasAnyKeyword(article: Article, keywords: string[]): boolean {
  const text = normalize(`${article.title} ${article.text}`);
  return keywords.some((keyword) => keywordMatches(text, keyword));
}

function hasBurundiRelevantSignal(article: Article): boolean {
  return hasAnyKeyword(article, GEOGRAPHIC_KEYWORDS) || hasAnyKeyword(article, FUNDING_KEYWORDS);
}

function organizationScore(article: Article): { orgScore: number; matchedOrganizations: Organization[] } {
  const result = matchOrganizations(`${article.title} ${article.text}`);
  return {
    orgScore: result.confidence,
    matchedOrganizations: result.matched
  };
}

async function semanticScore(article: Article): Promise<number> {
  const articleEmbedding = await fetchEmbedding(`${article.title}\n\n${article.text}`);
  const referenceEmbedding = await fetchEmbedding(SEMANTIC_REFERENCE);

  if (articleEmbedding.length === 0 || referenceEmbedding.length === 0) {
    return 0;
  }

  return cosineSimilarity(articleEmbedding, referenceEmbedding);
}

export async function RetrievalAgent(input: RetrievalAgentInput): Promise<RetrievalAgentOutput> {
  const scored = await Promise.all(
    input.articles.map(async (article) => {
      const kwScore = keywordScore(article);
      const { orgScore, matchedOrganizations } = organizationScore(article);
      const semScore = await semanticScore(article);

      const relevanceScore = 0.3 * kwScore + 0.3 * orgScore + 0.4 * semScore;

      return {
        ...article,
        retrieval: {
          keywordScore: kwScore,
          orgScore,
          semanticScore: semScore,
          relevanceScore,
          matchedOrganizations
        }
      };
    })
  );

  const articles = scored
    .filter(
      (article) =>
        article.retrieval.relevanceScore >= MIN_RELEVANCE_SCORE &&
        (hasBurundiRelevantSignal(article) ||
          article.retrieval.semanticScore >= MIN_SEMANTIC_RELEVANCE_WITHOUT_SIGNAL)
    )
    .sort((a, b) => b.retrieval.relevanceScore - a.retrieval.relevanceScore);

  return { articles };
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  const input: RetrievalAgentInput = raw ? JSON.parse(raw) : { articles: [] };
  const output = await RetrievalAgent(input);
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
