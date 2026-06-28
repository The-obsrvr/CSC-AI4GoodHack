import type { Article } from "./src/types.ts";

type ClassificationAgentInput = {
  articles: Article[];
};

type ClassificationAgentOutput = {
  articles: Article[];
};

type Classification = Article["classification"];

const MODEL = "gpt-4.1-mini";

const CATEGORIES = [
  "Political situation and security",
  "Health",
  "Gender-based violence, women's rights",
  "Education and Vocational training",
  "Humanitarian Aid and Refugees situation in Burundi",
  "Animal Welfare"
];

const SUBCATEGORIES = [
  "Ebola",
  "malaria",
  "maternal and child health",
  "International",
  "Germany",
  "Animal welfare in social media",
  "agriculture and consumer topics related to animal welfare"
];

function emptyClassification(): Classification {
  return {
    categories: [],
    subcategories: []
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

function normalizeClassification(value: Partial<Classification>): Classification {
  return {
    categories: Array.isArray(value.categories)
      ? value.categories.filter((category): category is string => CATEGORIES.includes(category))
      : [],
    subcategories: Array.isArray(value.subcategories)
      ? value.subcategories.filter((subcategory): subcategory is string => SUBCATEGORIES.includes(subcategory))
      : []
  };
}

async function classifyArticle(article: Article): Promise<Classification> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return emptyClassification();
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
            "Classify the article using only the allowed categories and subcategories.",
            "Return empty arrays if there is no confident match.",
            "Multiple categories and subcategories are allowed.",
            `Allowed categories: ${CATEGORIES.join("; ")}.`,
            `Allowed subcategories: ${SUBCATEGORIES.join("; ")}.`
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
          name: "article_classification",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["categories", "subcategories"],
            properties: {
              categories: {
                type: "array",
                items: {
                  type: "string",
                  enum: CATEGORIES
                }
              },
              subcategories: {
                type: "array",
                items: {
                  type: "string",
                  enum: SUBCATEGORIES
                }
              }
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Classification failed: ${response.status} ${response.statusText}`);
  }

  const outputText = extractOutputText(await response.json());
  if (!outputText) {
    return emptyClassification();
  }

  return normalizeClassification(JSON.parse(outputText) as Partial<Classification>);
}

export async function ClassificationAgent(
  input: ClassificationAgentInput
): Promise<ClassificationAgentOutput> {
  const articles = await Promise.all(
    input.articles.map(async (article) => ({
      ...article,
      classification: await classifyArticle(article)
    }))
  );

  return { articles };
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  const input: ClassificationAgentInput = raw ? JSON.parse(raw) : { articles: [] };
  const output = await ClassificationAgent(input);
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
