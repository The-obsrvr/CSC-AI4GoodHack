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

const KEYWORDS = [
  "animal welfare",
  "rabies",
  "livestock",
  "donkey",
  "wildlife",
  "poaching",
  "funding",
  "grant",
  "Burundi",
  "East Africa",
  "women",
  "education",
  "health"
];

const SEMANTIC_REFERENCE =
  "Animal welfare and development cooperation in Burundi including health, education, gender, rural livelihoods and funding";

const EMBEDDING_MODEL = "text-embedding-3-small";

function normalize(value: string): string {
  return value.toLowerCase();
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
  const matches = KEYWORDS.filter((keyword) => text.includes(normalize(keyword))).length;
  return matches / KEYWORDS.length;
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
    .filter((article) => article.retrieval.relevanceScore >= 0.65)
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
