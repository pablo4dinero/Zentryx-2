import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CACHE_MS = 10 * 60 * 1000;

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  category: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "neutral" | "negative";
  imageKeyword: string;
  imageUrl?: string;
  readMoreUrl?: string;
  readTime: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePubDate(pubDate: string | null | undefined): string {
  if (!pubDate) return new Date().toISOString();
  try {
    // NewsData.io format: "YYYY-MM-DD HH:MM:SS"
    return new Date(pubDate.replace(" ", "T") + "Z").toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function mapSentiment(s: string | null | undefined): "positive" | "neutral" | "negative" {
  if (s === "positive") return "positive";
  if (s === "negative") return "negative";
  return "neutral";
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function buildGroqImageUrl(keyword: string): string {
  return `https://source.unsplash.com/640x360/?${encodeURIComponent(keyword + ",food,nigeria")}`;
}


// ─── Mock data (Nigeria/Africa focus, used when no API key is set) ────────────

const MOCK_ITEMS_RAW = [
  { id: "1", headline: "Indomie Launches Bold New Pepper Soup Flavour Across Nigeria", summary: "De United Foods unveils a limited-edition Pepper Soup variant of the iconic Indomie brand, tapping into Nigeria's rich street food culture.", category: "Innovation", source: "BusinessDay Nigeria", publishedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "noodles spice nigeria", readTime: 2 },
  { id: "2", headline: "Nigeria's Suya Spice Blend Goes Global as Export Demand Rises", summary: "Artisan spice producers in Kaduna and Abuja are scaling production of the iconic suya seasoning mix for European and North American markets.", category: "Market", source: "Nairametrics", publishedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "suya spice grill", readTime: 3 },
  { id: "3", headline: "NAFDAC Tightens Labelling Rules for Imported Flavour Additives", summary: "New regulations require all imported flavour compounds to carry detailed allergen declarations and country-of-origin codes by Q3.", category: "Regulation", source: "Food Safety News NG", publishedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), sentiment: "neutral" as const, imageKeyword: "food label regulation", readTime: 4 },
  { id: "4", headline: "Locust Bean (Iru) Identified as High-Value Probiotic Ingredient", summary: "Researchers at University of Lagos confirm that fermented locust bean contains beneficial Bacillus strains with strong gut-health properties.", category: "Ingredients", source: "Journal of African Food Science", publishedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "fermented beans africa", readTime: 3 },
  { id: "5", headline: "West Africa Cassava Processing Capacity Set to Double by 2026", summary: "A $200M investment across Nigeria, Ghana, and Côte d'Ivoire will modernise cassava starch and flour production, reducing post-harvest losses.", category: "Food Tech", source: "AgriBusinessAfrica", publishedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "cassava processing africa", readTime: 3 },
  { id: "6", headline: "Moringa Powder Demand Surges as Nigerian Wellness Brands Scale Up", summary: "Domestic consumption of moringa-enriched products grew 34% in the last fiscal year as health-conscious urban consumers seek functional superfoods.", category: "Market", source: "Food Navigator Africa", publishedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "moringa powder green", readTime: 2 },
  { id: "7", headline: "Palm Oil Sustainability Crisis Threatens Nigerian Export Revenues", summary: "Growing EU import restrictions on non-certified palm oil could cost Nigeria ₦180B in annual export revenue.", category: "Sustainability", source: "Channels Business", publishedAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(), sentiment: "negative" as const, imageKeyword: "palm oil plantation", readTime: 4 },
  { id: "8", headline: "Kuli-Kuli Brand Expands into Plant-Based Protein Snack Line", summary: "A Lagos-based food startup reformulates the traditional groundnut cake into a high-protein snack bar targeting gym-goers and urban professionals.", category: "Innovation", source: "TechCabal Food", publishedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "peanut snack bar", readTime: 2 },
  { id: "9", headline: "Ogiri Fermentation Science Opens New Umami Flavour Pathways", summary: "Food scientists are isolating dominant Bacillus species in ogiri to develop standardised umami flavour concentrates for commercial seasonings.", category: "Food Tech", source: "Food Chemistry Africa", publishedAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "fermentation science lab", readTime: 4 },
  { id: "10", headline: "Nigerian Breadfruit Flour Gains Traction as Wheat Substitute", summary: "With wheat import costs at record highs, bakers across the south-west are adopting breadfruit flour blends that cut costs by up to 40%.", category: "Ingredients", source: "BusinessDay Nigeria", publishedAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "breadfruit flour baking", readTime: 3 },
  { id: "11", headline: "E-Commerce Drives 60% Growth in Artisan Seasoning Brands", summary: "Small-batch seasoning producers from Aba and Onitsha are leveraging social commerce to reach diaspora customers in the USA and UK.", category: "Market", source: "Nairametrics", publishedAt: new Date(Date.now() - 11 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "spice market africa", readTime: 2 },
  { id: "12", headline: "Afang and Egusi Soups Inspire New Instant Meal Range in West Africa", summary: "Nestlé West Africa announces a premium instant soup line inspired by traditional Nigerian dishes, targeting urban consumers seeking convenient flavours.", category: "Innovation", source: "Food Navigator Africa", publishedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(), sentiment: "positive" as const, imageKeyword: "nigerian soup ingredients", readTime: 3 },
];

const MOCK_ITEMS: NewsItem[] = MOCK_ITEMS_RAW.map(item => ({
  ...item,
  imageUrl: buildGroqImageUrl(item.imageKeyword),
}));

// ─── Cache ────────────────────────────────────────────────────────────────────

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;

// ─── NewsData.io ──────────────────────────────────────────────────────────────

interface NewsDataArticle {
  article_id: string;
  title: string;
  description: string | null;
  link: string;
  source_id: string;
  source_name?: string;
  pubDate: string | null;
  category: string[] | null;
  sentiment: string | null;
  image_url: string | null;
}

async function fetchFromNewsData(): Promise<NewsItem[]> {
  const url =
    `https://newsdata.io/api/1/news` +
    `?apikey=${NEWSDATA_API_KEY}` +
    `&q=${encodeURIComponent("food science OR food technology OR food innovation")}` +
    `&language=en` +
    `&category=science,technology`;

  const res = await fetch(url);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error(`NewsData.io error ${res.status}:`, JSON.stringify(errBody));
    throw new Error(`NewsData.io error ${res.status}`);
  }

  const data = await res.json() as { status: string; results: NewsDataArticle[] };
  if (data.status !== "success" || !Array.isArray(data.results)) {
    throw new Error("Invalid NewsData.io response");
  }

  return data.results
    .filter(a => a.title && a.link)
    .map((article, idx): NewsItem => {
      const description = article.description || "";
      const summary = description.length > 120
        ? description.slice(0, 120).trimEnd() + "…"
        : description;
      const categoryRaw = article.category?.[0] || "science";
      const wordCount = description.split(/\s+/).filter(Boolean).length;

      return {
        id: article.article_id || String(idx + 1),
        headline: article.title,
        summary,
        category: toTitleCase(categoryRaw),
        source: article.source_name || article.source_id,
        publishedAt: parsePubDate(article.pubDate),
        sentiment: mapSentiment(article.sentiment),
        imageKeyword: categoryRaw + " food",
        imageUrl: article.image_url || undefined,
        readMoreUrl: article.link,
        readTime: Math.max(1, Math.min(5, Math.ceil(wordCount / 50))),
      };
    });
}

// ─── Groq (fallback when NEWSDATA_API_KEY not set) ────────────────────────────

async function fetchFromGroq(): Promise<NewsItem[]> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 3500,
      temperature: 0.75,
      messages: [
        { role: "system", content: "You are a food industry news aggregator. Return valid JSON arrays only." },
        {
          role: "user",
          content: `Generate 12 realistic news items for food science and R&D professionals focused on Nigeria and West Africa. Today is ${new Date().toISOString()}.

Return ONLY a JSON array with 12 objects each having: "id" (1-12), "headline" (<90 chars), "summary" (<220 chars), "category" (one of: Food Tech, Market, Regulation, Sustainability, Innovation, Ingredients), "source" (Nigerian/African publication), "publishedAt" (ISO, last 24h), "sentiment" (positive/neutral/negative), "imageKeyword" (2-4 words), "readTime" (1-4).
Return ONLY the array.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error(`Groq API error ${res.status}:`, JSON.stringify(errBody));
    throw new Error(`Groq API error ${res.status}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const raw = (data.choices?.[0]?.message?.content || "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  const items = JSON.parse(raw) as Omit<NewsItem, "imageUrl" | "readMoreUrl">[];
  if (!Array.isArray(items) || items.length === 0) throw new Error("Invalid Groq response");

  return items.map(item => ({
    ...item,
    imageUrl: buildGroqImageUrl(item.imageKeyword),
  }));
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  try {
    if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
      return;
    }

    let items: NewsItem[];

    if (NEWSDATA_API_KEY) {
      items = await fetchFromNewsData();
    } else if (GROQ_API_KEY) {
      console.log("[INFO] No NEWSDATA_API_KEY — falling back to Groq");
      items = await fetchFromGroq();
    } else {
      console.log("[DEV] No API keys configured — serving mock news feed");
      if (!cache) cache = { items: MOCK_ITEMS, fetchedAt: Date.now() };
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
      return;
    }

    cache = { items, fetchedAt: Date.now() };
    res.json({ items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
  } catch (err) {
    console.error("Newsfeed error:", err);
    if (cache) {
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: true });
      return;
    }
    // Serve mock data so UI never breaks
    res.json({ items: MOCK_ITEMS, fetchedAt: new Date().toISOString(), stale: true });
  }
});

export default router;
