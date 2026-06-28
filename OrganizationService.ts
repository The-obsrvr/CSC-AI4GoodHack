import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

export interface Organization {
  id: string;
  name: string;
  type: string;
  country: string;
  region: string;
  is_nrw: boolean;
  focus_areas: string[];
  notes: string;
}

type MatchResult = {
  matched: Organization[];
  confidence: number;
};

let cachedOrganizations: Organization[] | null = null;

function parseBoolean(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function parseFocusAreas(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadOrganizations(): Organization[] {
  if (cachedOrganizations) {
    return cachedOrganizations;
  }

  const csvPath = path.join(process.cwd(), "data", "organizations.csv");
  const csv = fs.readFileSync(csvPath, "utf8");
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];

  cachedOrganizations = records.map((record) => ({
    id: record.id ?? "",
    name: record.name ?? "",
    type: record.type ?? "",
    country: record.country ?? "",
    region: record.region ?? "",
    is_nrw: parseBoolean(record.is_nrw),
    focus_areas: parseFocusAreas(record.focus_areas),
    notes: record.notes ?? ""
  }));

  return cachedOrganizations;
}

function matchOrganizations(text: string): MatchResult {
  const haystack = text.toLowerCase();
  const matched = loadOrganizations().filter((organization) => {
    const nameMatch = haystack.includes(organization.name.toLowerCase());
    const focusMatch = organization.focus_areas.some((keyword) =>
      haystack.includes(keyword.toLowerCase())
    );

    return nameMatch || focusMatch;
  });

  return {
    matched,
    confidence: matched.length > 0 ? 1 : 0
  };
}

export { loadOrganizations, matchOrganizations };

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv.slice(2).join(" ");
  const result = matchOrganizations(input);
  console.log(JSON.stringify(result, null, 2));
}
