import type { Article } from "./src/types.ts";

type FundingExtractionAgentInput = {
  articles: Article[];
};

type FundingExtractionAgentOutput = {
  articles: Article[];
};

type FundingExtraction = {
  sponsor: string | null;
  deadlineRaw: string | null;
  amountRaw: string | null;
  amountValue: number | null;
  currency: string | null;
  eligibleForBurundi: boolean | null;
  eligibleRegions: string[];
};

const MODEL = "gpt-4.1-mini";
const ALLOWED_REGIONS = ["Burundi", "Bujumbura", "Gitega", "East Africa", "Great Lakes Region"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function emptyExtraction(): FundingExtraction {
  return {
    sponsor: null,
    deadlineRaw: null,
    amountRaw: null,
    amountValue: null,
    currency: null,
    eligibleForBurundi: null,
    eligibleRegions: []
  };
}

function extractOutputText(response: unknown): string | null {
  const data = response as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  for (const output of data.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function normalizeExtraction(value: Partial<FundingExtraction>): FundingExtraction {
  const amountValue = typeof value.amountValue === "number" && Number.isFinite(value.amountValue)
    ? value.amountValue
    : null;

  return {
    sponsor: typeof value.sponsor === "string" ? value.sponsor : null,
    deadlineRaw: typeof value.deadlineRaw === "string" ? value.deadlineRaw : null,
    amountRaw: typeof value.amountRaw === "string" ? value.amountRaw : null,
    amountValue,
    currency: typeof value.currency === "string" ? value.currency : null,
    eligibleForBurundi: typeof value.eligibleForBurundi === "boolean" ? value.eligibleForBurundi : null,
    eligibleRegions: Array.isArray(value.eligibleRegions)
      ? value.eligibleRegions.filter((region): region is string => ALLOWED_REGIONS.includes(region))
      : []
  };
}

function isSmallProject(amountValue: number | null, currency: string | null): boolean | null {
  if (amountValue === null) {
    return null;
  }

  const normalizedCurrency = currency?.trim().toUpperCase() ?? null;
  if (normalizedCurrency && normalizedCurrency !== "USD" && normalizedCurrency !== "$") {
    return null;
  }

  return amountValue < 10000;
}

function parseDeadlineIso(deadlineRaw: string | null): string | null {
  if (!deadlineRaw) {
    return null;
  }

  const parsed = new Date(deadlineRaw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function daysUntilDeadline(deadlineIso: string | null): number | null {
  if (!deadlineIso) {
    return null;
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const deadline = new Date(`${deadlineIso}T00:00:00.000Z`);
  const deadlineUtc = Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate());

  return Math.ceil((deadlineUtc - todayUtc) / MS_PER_DAY);
}

function urgencyLevel(days: number | null): Article["funding"]["urgencyLevel"] {
  if (days === null) {
    return "unknown";
  }

  if (days <= 7) {
    return "high";
  }

  if (days <= 14) {
    return "medium";
  }

  return "normal";
}

async function extractFunding(article: Article): Promise<FundingExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return emptyExtraction();
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "system",
          content: [
            "Extract funding information from article text.",
            "Never infer facts that are not present.",
            "Use null when unknown.",
            `eligibleRegions may only contain: ${ALLOWED_REGIONS.join(", ")}.`,
            "amountValue must be numeric only if clearly extractable."
          ].join(" ")
        },
        {
          role: "user",
          content: `Title: ${article.title}\nURL: ${article.url}\n\nArticle text:\n${article.text.slice(0, 16000)}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "funding_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "sponsor",
              "deadlineRaw",
              "amountRaw",
              "amountValue",
              "currency",
              "eligibleForBurundi",
              "eligibleRegions"
            ],
            properties: {
              sponsor: { type: ["string", "null"] },
              deadlineRaw: { type: ["string", "null"] },
              amountRaw: { type: ["string", "null"] },
              amountValue: { type: ["number", "null"] },
              currency: { type: ["string", "null"] },
              eligibleForBurundi: { type: ["boolean", "null"] },
              eligibleRegions: {
                type: "array",
                items: {
                  type: "string",
                  enum: ALLOWED_REGIONS
                }
              }
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Funding extraction failed: ${response.status} ${response.statusText}`);
  }

  const outputText = extractOutputText(await response.json());
  if (!outputText) {
    return emptyExtraction();
  }

  return normalizeExtraction(JSON.parse(outputText) as Partial<FundingExtraction>);
}

export async function FundingExtractionAgent(
  input: FundingExtractionAgentInput
): Promise<FundingExtractionAgentOutput> {
  const articles = await Promise.all(
    input.articles.map(async (article) => {
      const extraction = await extractFunding(article);
      const deadlineIso = parseDeadlineIso(extraction.deadlineRaw);
      const days = daysUntilDeadline(deadlineIso);

      return {
        ...article,
        funding: {
          ...article.funding,
          ...extraction,
          deadlineIso,
          daysUntilDeadline: days,
          urgencyLevel: urgencyLevel(days),
          isSmallProject: isSmallProject(extraction.amountValue, extraction.currency)
        }
      };
    })
  );

  return { articles };
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  const input: FundingExtractionAgentInput = raw ? JSON.parse(raw) : { articles: [] };
  const output = await FundingExtractionAgent(input);
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
