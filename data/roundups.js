// Weekly synthesis of the research feed. Ask Claude to "generate this week's
// roundup" periodically — it reads everything added that week, writes a
// short synthesis + the themes that came up more than once, and appends a
// record here. Schema is documented in CLAUDE.md.

const ROUNDUPS = [
  {
    id: "2026-07-07-2026-07-13",
    weekLabel: "Jul 7 – Jul 13, 2026",
    weekStart: "2026-07-07",
    weekEnd: "2026-07-13",
    summary: "A light first week: four articles spanning a hawkish Fed surprise, an AI-underwriting product launch relevant to an active fintech diligence, an EU workforce-classification rule with cross-portfolio exposure, and a portfolio company's new distribution channel. No dominant theme yet beyond AI touching multiple sectors at once — worth watching whether that becomes a pattern next week.",
    keyThemes: [
      { theme: "AI showing up as an underwriting/ops layer, not just a chat feature", articleIds: ["2026-07-11-ramp-ai-underwriting"] },
      { theme: "Regulatory exposure for workforce-sector companies with EU operations", articleIds: ["2026-07-13-gig-work-regulation-eu"] }
    ],
    generatedAt: "2026-07-13"
  }
];
