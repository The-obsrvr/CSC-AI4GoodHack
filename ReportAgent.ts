import type { Article, ReportOutput } from "./src/types.ts";

type ReportAgentInput = {
  articles: Article[];
  limit?: number;
};

type ArticleCategory = "news" | "funding" | "report";
type ReportGroupKey = "urgentFunding" | "otherFunding" | "report" | "news";

type GermanArticleText = {
  titleDe: string;
  summaryDe: string[];
};

type ArticleWithOptionalType = Article & {
  type?: unknown;
};

const MODEL = "gpt-4.1-mini";
const DEFAULT_LIMIT = 10;
const UNKNOWN = "Unbekannt";
const GROUP_ORDER: ReportGroupKey[] = ["urgentFunding", "otherFunding", "report", "news"];

function rankValue(article: Article): number {
  return article.ranking.finalRank ?? Number.MAX_SAFE_INTEGER;
}

function selectTopArticles(articles: Article[], limit = DEFAULT_LIMIT): Article[] {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;

  return [...articles]
    .sort((a, b) => rankValue(a) - rankValue(b))
    .slice(0, normalizedLimit);
}

function hasFundingDetails(article: Article): boolean {
  return Boolean(
    article.funding.sponsor ||
      article.funding.deadlineRaw ||
      article.funding.deadlineIso ||
      article.funding.amountRaw ||
      article.funding.amountValue !== null ||
      article.funding.currency ||
      article.funding.eligibleForBurundi !== null ||
      article.funding.eligibleRegions.length > 0
  );
}

function getArticleType(article: Article): string {
  const type = (article as ArticleWithOptionalType).type;
  return typeof type === "string" ? type.trim().toLowerCase() : "";
}

export function getDisplayCategory(article: Article): string {
  const type = getArticleType(article);

  if (hasFundingDetails(article) || type === "funding") {
    return "Funding";
  }

  if (type === "report") {
    return "Report";
  }

  return "News";
}

function categoryForArticle(article: Article): ArticleCategory {
  const category = getDisplayCategory(article);

  if (category === "Funding") {
    return "funding";
  }

  if (category === "Report") {
    return "report";
  }

  return "news";
}

function fundingUrgencyLabel(article: Article): string | null {
  if (getDisplayCategory(article) !== "Funding") {
    return null;
  }

  if (article.funding.urgencyLevel === "high") {
    return "Dringend";
  }

  if (article.funding.urgencyLevel === "medium") {
    return "Mittlere Priorität";
  }

  if (article.funding.urgencyLevel === "normal") {
    return "Normale Priorität";
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return UNKNOWN;
  }

  return String(value);
}

function thematicCategories(article: Article): string[] {
  const categories = [
    ...article.classification.categories,
    ...article.classification.subcategories
  ];

  return Array.from(new Set(categories.map((category) => category.trim()).filter(Boolean)));
}

function yesNoUnknown(value: boolean | null): string {
  if (value === true) {
    return "Ja";
  }

  if (value === false) {
    return "Nein";
  }

  return UNKNOWN;
}

function burundiEligibility(value: boolean | null): string {
  if (value === true) {
    return "Ja";
  }

  if (value === false) {
    return "Nein";
  }

  return "Manuelle Prüfung empfohlen";
}

function nrwRegistration(article: Article): string {
  const sponsor = article.funding.sponsor?.trim().toLowerCase();
  const organizations = article.retrieval.matchedOrganizations;
  const organization = sponsor
    ? organizations.find((item) => item.name.toLowerCase() === sponsor)
    : organizations.length === 1
      ? organizations[0]
      : null;

  return organization ? yesNoUnknown(organization.is_nrw) : UNKNOWN;
}

function fallbackGermanText(article: Article): GermanArticleText {
  const sentences = article.text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 5);

  return {
    titleDe: article.title,
    summaryDe: constrainSummaryLines(
      sentences.length > 0
        ? sentences
        : [
            "Keine Zusammenfassung verfügbar.",
            "Bitte den Originalartikel manuell prüfen.",
            "Quelle, Datum und URL wurden unverändert übernommen."
          ]
    )
  };
}

function constrainSummaryLines(lines: string[]): string[] {
  const cleaned = lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const selected = cleaned.slice(0, 5);

  while (selected.length < 3) {
    selected.push("Weitere Details sind im Originalartikel zu prüfen.");
  }

  return selected;
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

function normalizeGermanText(value: Partial<GermanArticleText>, article: Article): GermanArticleText {
  const fallback = fallbackGermanText(article);
  const summary = Array.isArray(value.summaryDe)
    ? value.summaryDe.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : [];

  return {
    titleDe: typeof value.titleDe === "string" && value.titleDe.trim() ? value.titleDe : fallback.titleDe,
    summaryDe: summary.length > 0 ? constrainSummaryLines(summary) : fallback.summaryDe
  };
}

async function createGermanText(article: Article): Promise<GermanArticleText> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return fallbackGermanText(article);
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
            "Erstelle Newsletter-Bausteine auf Deutsch.",
            "Übersetze den Titel ins Deutsche, falls er nicht Deutsch ist.",
            "Schreibe eine kurze deutsche Zusammenfassung in 3 bis 5 Zeilen.",
            "Erfinde keine Fakten und erhalte Quelle, Datum und URL unverändert außerhalb dieser Antwort."
          ].join(" ")
        },
        {
          role: "user",
          content: `Titel: ${article.title}\nOriginalsprache: ${article.language}\nQuelle: ${article.source}\nDatum: ${article.date}\n\nText:\n${article.text.slice(0, 16000)}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "german_article_text",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["titleDe", "summaryDe"],
            properties: {
              titleDe: { type: "string" },
              summaryDe: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Report text generation failed: ${response.status} ${response.statusText}`);
  }

  const outputText = extractOutputText(await response.json());
  if (!outputText) {
    return fallbackGermanText(article);
  }

  return normalizeGermanText(JSON.parse(outputText) as Partial<GermanArticleText>, article);
}

function fundingLines(article: Article): string[] {
  if (!hasFundingDetails(article)) {
    return [];
  }

  const amount =
    article.funding.amountRaw ??
    (article.funding.amountValue !== null
      ? `${article.funding.amountValue}${article.funding.currency ? ` ${article.funding.currency}` : ""}`
      : null);

  return [
    `Deadline: ${display(article.funding.deadlineIso ?? article.funding.deadlineRaw)}`,
    `Sponsor: ${display(article.funding.sponsor)}`,
    `Förderhöhe: ${display(amount)}`,
    `Kleinprojektförderung (< 10000 USD): ${yesNoUnknown(article.funding.isSmallProject)}`,
    `NRW Registrierung: ${nrwRegistration(article)}`,
    `Burundi förderfähig: ${burundiEligibility(article.funding.eligibleForBurundi)}`
  ];
}

function articleTextBlock(article: Article, german: GermanArticleText, category: ArticleCategory): string {
  const themes = thematicCategories(article);
  const urgency = fundingUrgencyLabel(article);
  const lines = [
    german.titleDe,
    ...(urgency ? [`Priorität: ${urgency}`] : []),
    ...(themes.length > 0 ? [`Themen: ${themes.join(", ")}`] : []),
    `Kategorie: ${getDisplayCategory(article)}`,
    `Datum: ${display(article.date)}`,
    `Quelle: ${display(article.source)}`,
    `URL: ${display(article.url)}`,
    `Originalsprache: ${display(article.language)}`,
    "Zusammenfassung:",
    ...german.summaryDe.map((line) => `- ${line}`)
  ];
  const funding = fundingLines(article);

  if (funding.length > 0) {
    lines.push("", "Förderdetails:", ...funding.map((line) => `- ${line}`));
  }

  return lines.join("\n");
}

function articleHtmlBlock(article: Article, german: GermanArticleText, category: ArticleCategory): string {
  const funding = fundingLines(article);
  const themes = thematicCategories(article);
  const urgency = fundingUrgencyLabel(article);
  const urgencyHtml = urgency
    ? `<p style="margin:0 0 8px 0;color:#8a1f11;"><strong>Priorität:</strong> ${escapeHtml(urgency)}</p>`
    : "";
  const themeHtml = themes.length > 0
    ? `<p style="margin:0 0 8px 0;color:#555;"><strong>Themen:</strong> ${escapeHtml(themes.join(", "))}</p>`
    : "";
  const url = article.url
    ? `<p style="margin:4px 0;"><strong>URL:</strong> <a href="${escapeHtml(article.url)}">${escapeHtml(article.url)}</a></p>`
    : `<p style="margin:4px 0;"><strong>URL:</strong> ${UNKNOWN}</p>`;

  return [
    '<section style="border-top:1px solid #ddd;padding:16px 0;">',
    `<h3 style="margin:0 0 8px 0;">${escapeHtml(german.titleDe)}</h3>`,
    urgencyHtml,
    themeHtml,
    `<p style="margin:4px 0;"><strong>Kategorie:</strong> ${escapeHtml(getDisplayCategory(article))}</p>`,
    `<p style="margin:4px 0;"><strong>Datum:</strong> ${escapeHtml(display(article.date))}</p>`,
    `<p style="margin:4px 0;"><strong>Quelle:</strong> ${escapeHtml(display(article.source))}</p>`,
    url,
    `<p style="margin:4px 0;"><strong>Originalsprache:</strong> ${escapeHtml(display(article.language))}</p>`,
    '<p style="margin:12px 0 4px 0;"><strong>Kurze Zusammenfassung:</strong></p>',
    `<ul style="margin:4px 0 0 20px;padding:0;">${german.summaryDe.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
    funding.length > 0
      ? `<p style="margin:12px 0 4px 0;"><strong>Förderdetails:</strong></p><ul style="margin:4px 0 0 20px;padding:0;">${funding.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
      : "",
    "</section>"
  ].join("");
}

function groupLabel(group: ReportGroupKey): string {
  if (group === "urgentFunding") {
    return "Dringende Fördermöglichkeiten";
  }

  if (group === "otherFunding") {
    return "Weitere Förderungen";
  }

  if (group === "report") {
    return "Berichte";
  }

  return "Nachrichten";
}

function groupForItem(item: { article: Article; category: ArticleCategory }): ReportGroupKey {
  if (item.category === "funding") {
    return item.article.funding.urgencyLevel === "high" ? "urgentFunding" : "otherFunding";
  }

  if (item.category === "report") {
    return "report";
  }

  return "news";
}

function sortRenderedByRank(
  items: Array<{ article: Article; german: GermanArticleText; category: ArticleCategory }>
): Array<{ article: Article; german: GermanArticleText; category: ArticleCategory }> {
  return [...items].sort((a, b) => rankValue(a.article) - rankValue(b.article));
}

function groupArticles(items: Array<{ article: Article; german: GermanArticleText; category: ArticleCategory }>) {
  return {
    urgentFunding: sortRenderedByRank(items.filter((item) => groupForItem(item) === "urgentFunding")),
    otherFunding: sortRenderedByRank(items.filter((item) => groupForItem(item) === "otherFunding")),
    report: sortRenderedByRank(items.filter((item) => groupForItem(item) === "report")),
    news: sortRenderedByRank(items.filter((item) => groupForItem(item) === "news"))
  };
}

export async function ReportAgent(input: ReportAgentInput): Promise<ReportOutput> {
  const articlesUsed = selectTopArticles(input.articles, input.limit);
  const rendered = await Promise.all(
    articlesUsed.map(async (article) => ({
      article,
      german: await createGermanText(article),
      category: categoryForArticle(article)
    }))
  );
  const grouped = groupArticles(rendered);
  const today = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date());
  const subject = `Burundi-Newsletter vom ${today}: ${articlesUsed.length} Hinweise`;
  const intro = `Guten Tag,\n\nhier ist die aktuelle Auswahl der wichtigsten Meldungen und Förderhinweise für Burundi. Die Reihenfolge folgt der berechneten Relevanz und Dringlichkeit.`;

  const textSections = [
    subject,
    "",
    intro,
    "",
    ...GROUP_ORDER.flatMap((group) => {
      const items = grouped[group];
      if (items.length === 0) {
        return [];
      }

      return [
        `## ${groupLabel(group)}`,
        "",
        ...items.map((item) => articleTextBlock(item.article, item.german, item.category)),
        ""
      ];
    })
  ];

  const htmlSections = GROUP_ORDER
    .map((group) => {
      const items = grouped[group];
      if (items.length === 0) {
        return "";
      }

      return [
        `<h2 style="font-size:18px;margin:24px 0 8px 0;">${escapeHtml(groupLabel(group))}</h2>`,
        ...items.map((item) => articleHtmlBlock(item.article, item.german, item.category))
      ].join("");
    })
    .join("");

  const html = [
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;">',
    `<h1 style="font-size:22px;margin:0 0 12px 0;">${escapeHtml(subject)}</h1>`,
    '<p style="margin:0 0 12px 0;">Guten Tag,</p>',
    '<p style="margin:0 0 16px 0;">Hier ist die aktuelle Auswahl der wichtigsten Meldungen und Förderhinweise für Burundi. Die Reihenfolge folgt der berechneten Relevanz und Dringlichkeit.</p>',
    htmlSections || '<p style="margin:0;">Keine passenden Artikel gefunden.</p>',
    "</div>"
  ].join("");

  return {
    subject,
    html,
    text: textSections.join("\n").trim(),
    articlesUsed
  };
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  const input: ReportAgentInput = raw ? JSON.parse(raw) : { articles: [] };
  const output = await ReportAgent(input);
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
