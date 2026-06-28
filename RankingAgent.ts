import type { Article } from "./src/types.ts";

type RankingAgentInput = {
  articles: Article[];
};

type RankingAgentOutput = {
  articles: Article[];
};

function urgencyScore(level: Article["funding"]["urgencyLevel"]): number {
  if (level === "high") {
    return 1.0;
  }

  if (level === "medium") {
    return 0.7;
  }

  if (level === "normal") {
    return 0.3;
  }

  return 0.0;
}

function fundingScore(article: Article): number {
  let score = 0;

  if (article.funding.sponsor) {
    score += 0.25;
  }

  if (article.funding.eligibleForBurundi === true) {
    score += 0.20;
  }

  return Math.min(score, 1.0);
}

export async function RankingAgent(input: RankingAgentInput): Promise<RankingAgentOutput> {
  const ranked = input.articles
    .map((article) => {
      const urgency = urgencyScore(article.funding.urgencyLevel);
      const funding = fundingScore(article);
      const finalScore = 0.55 * article.retrieval.relevanceScore + 0.30 * urgency + 0.15 * funding;

      return {
        ...article,
        ranking: {
          fundingScore: funding,
          urgencyScore: urgency,
          finalScore,
          finalRank: null
        }
      };
    })
    .sort((a, b) => b.ranking.finalScore - a.ranking.finalScore)
    .map((article, index) => ({
      ...article,
      ranking: {
        ...article.ranking,
        finalRank: index + 1
      }
    }));

  return { articles: ranked };
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  const input: RankingAgentInput = raw ? JSON.parse(raw) : { articles: [] };
  const output = await RankingAgent(input);
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
