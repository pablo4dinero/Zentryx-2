import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CACHE_MS = 20 * 60 * 1000;

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  category: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "neutral" | "negative";
  imageKeyword: string;
  readTime: number;
}

const MOCK_ITEMS: NewsItem[] = [
  { id: "1", headline: "Plant-Based Protein Market to Hit $35B by 2027", summary: "Global demand for plant-based proteins surges as consumers shift toward sustainable diets. Major food manufacturers are accelerating R&D investment in pea and soy isolates.", category: "Market", source: "Food Navigator", publishedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "protein", readTime: 3 },
  { id: "2", headline: "FDA Updates Guidance on Novel Food Ingredient Labeling", summary: "New labeling requirements for bioengineered food ingredients take effect next quarter. Manufacturers must update packaging to remain compliant.", category: "Regulation", source: "Food Safety News", publishedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), sentiment: "neutral", imageKeyword: "label", readTime: 4 },
  { id: "3", headline: "Cocoa Prices Stabilize After Year of Record Volatility", summary: "West African harvests recover from weather disruptions, bringing relief to confectionery and chocolate manufacturers globally.", category: "Ingredients", source: "Ingredient Insights", publishedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "cocoa", readTime: 2 },
  { id: "4", headline: "AI-Driven Flavour Matching Cuts Reformulation Time by 60%", summary: "New machine learning tools analyse sensory data to predict flavour profiles with high accuracy, dramatically reducing product development cycles.", category: "Food Tech", source: "FoodTech Weekly", publishedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "technology", readTime: 3 },
  { id: "5", headline: "EU Moves to Restrict Titanium Dioxide in Food Products", summary: "European Food Safety Authority recommends phasing out TiO2 as a food additive over concerns about potential genotoxicity in nanoscale particles.", category: "Regulation", source: "EurActiv Food", publishedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(), sentiment: "negative", imageKeyword: "regulation", readTime: 4 },
  { id: "6", headline: "Precision Fermentation Startup Raises $120M Series C", summary: "FermentIQ secures major funding to scale animal-free dairy protein production, with commercial launch planned for Q3 this year.", category: "Innovation", source: "AgFunder News", publishedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "fermentation", readTime: 2 },
  { id: "7", headline: "Palm Oil Supply Chain Faces New Deforestation Scrutiny", summary: "European import regulations require suppliers to certify palm oil is deforestation-free by year-end, impacting over 40% of global trade routes.", category: "Sustainability", source: "Rabobank Food", publishedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), sentiment: "negative", imageKeyword: "forest", readTime: 3 },
  { id: "8", headline: "Bioactive Peptides from Dairy Waste Show Promise as Functional Ingredients", summary: "Researchers demonstrate cheese whey by-products yield high-value bioactive compounds with antioxidant and antimicrobial properties.", category: "Ingredients", source: "Journal of Food Science", publishedAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "dairy", readTime: 4 },
  { id: "9", headline: "Snack Dusting Market Grows 18% as Flavour Complexity Drives Premium", summary: "Consumers willing to pay 25–40% more for multi-layered seasoning experiences, creating major opportunities for innovative dusting blends.", category: "Market", source: "Mintel", publishedAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "snacks", readTime: 2 },
  { id: "10", headline: "Vertical Farming Cuts Fresh Herb Supply Chain to 24 Hours", summary: "Urban agriculture startups partner with food manufacturers to deliver consistent, pesticide-free herb ingredients with dramatically reduced transit times.", category: "Sustainability", source: "AgTech Today", publishedAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "farming", readTime: 3 },
  { id: "11", headline: "Microplastic Contamination Found in 78% of Tested Salt Samples", summary: "Peer-reviewed study raises alarm over food safety implications of microplastic ingestion, calling for updated testing protocols across the industry.", category: "Food Tech", source: "Environmental Science", publishedAt: new Date(Date.now() - 11 * 3600 * 1000).toISOString(), sentiment: "negative", imageKeyword: "salt", readTime: 4 },
  { id: "12", headline: "Clean Label Trend Reshapes Bread Premix Formulations", summary: "Bakery manufacturers are eliminating artificial emulsifiers from premix lines as retailers demand cleaner ingredient lists to meet growing consumer expectations.", category: "Innovation", source: "Baking Business", publishedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "bread", readTime: 2 },
];

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;

async function fetchFromAnthropic(): Promise<NewsItem[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `Generate 12 realistic, current news items for food science and R&D professionals. Today is ${new Date().toISOString()}.

Return ONLY a valid JSON array with exactly 12 objects. Each object must have:
- "id": "1" through "12"
- "headline": engaging string under 90 characters
- "summary": 2-3 sentences, under 220 characters total
- "category": exactly one of: "Food Tech", "Market", "Regulation", "Sustainability", "Innovation", "Ingredients"
- "source": realistic food industry publication name
- "publishedAt": ISO 8601 datetime within the last 24 hours
- "sentiment": exactly one of: "positive", "neutral", "negative"
- "imageKeyword": single descriptive word
- "readTime": integer between 1 and 4

Cover diverse topics: plant-based foods, food safety recalls, ingredient market shifts, sustainability targets, food biotech advances, packaging innovations, regulatory changes, supply chain issues, consumer trends.
Return ONLY the JSON array. No markdown fences, no explanation, no extra text.`,
      }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error(`Anthropic API error ${res.status}:`, JSON.stringify(errBody));
    throw new Error(`Anthropic API error ${res.status}: ${JSON.stringify(errBody)}`);
  }

  const data = await res.json() as { content: { type: string; text: string }[] };
  const raw = (data.content?.[0]?.text || "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  const items = JSON.parse(raw);
  if (!Array.isArray(items) || items.length === 0) throw new Error("Invalid response format");
  return items as NewsItem[];
}

router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  try {
    if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
      return;
    }

    if (!ANTHROPIC_API_KEY) {
      console.log("[DEV] No ANTHROPIC_API_KEY — serving mock news feed");
      if (!cache) cache = { items: MOCK_ITEMS, fetchedAt: Date.now() };
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
      return;
    }

    const items = await fetchFromAnthropic();
    cache = { items, fetchedAt: Date.now() };
    res.json({ items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
  } catch (err) {
    console.error("Newsfeed error:", err);
    if (cache) {
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: true });
      return;
    }
    // API unavailable — serve mock data so the UI works
    res.json({ items: MOCK_ITEMS, fetchedAt: new Date().toISOString(), stale: true });
  }
});

export default router;
