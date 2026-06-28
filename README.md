# Mutagent Helix Minimal Pipeline

Minimal TypeScript pipeline with lifecycle agents:

- `SourceAgent` fetches RSS articles
- `RetrievalAgent` scores and filters articles by keywords, organization matches, and embeddings
- `FundingExtractionAgent` extracts deadline, sponsor, amount, and eligibility details
- `ClassificationAgent` classifies articles
- `RankingAgent` computes the final score and rank
- `ReportAgent` produces a German email newsletter in HTML and plain text

## Run

1. Set `OPENAI_API_KEY` if you want live semantic retrieval, funding extraction, classification, and German newsletter generation.
2. Compile with `npm run check`.
3. Run the entrypoint with your preferred TS runtime or transpiler.

The project is intentionally small and can be dropped into the mutagent-helix workflow as a starting point.
