import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
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
  imageUrl: string;
  readMoreUrl: string;
  readTime: number;
}

function buildImageUrl(keyword: string): string {
  return `https://source.unsplash.com/640x360/?${encodeURIComponent(keyword + ",food,nigeria")}`;
}

function buildReadMoreUrl(headline: string): string {
  return `https://news.google.com/search?q=${encodeURIComponent(headline)}&hl=en-NG&gl=NG`;
}

const MOCK_ITEMS_RAW = [
  { id: "1", headline: "Indomie Launches Bold New Pepper Soup Flavour Across Nigeria", summary: "De United Foods unveils a limited-edition Pepper Soup variant of the iconic Indomie brand, tapping into Nigeria's rich street food culture. Early consumer response from Lagos and Abuja markets has been overwhelmingly positive.", category: "Innovation", source: "BusinessDay Nigeria", publishedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "noodles spice nigeria", readTime: 2 },
  { id: "2", headline: "Nigeria's Suya Spice Blend Goes Global as Export Demand Rises", summary: "Artisan spice producers in Kaduna and Abuja are scaling production of the iconic suya seasoning mix for European and North American markets. Export volumes doubled year-on-year.", category: "Market", source: "Nairametrics", publishedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "suya spice grill", readTime: 3 },
  { id: "3", headline: "NAFDAC Tightens Labelling Rules for Imported Flavour Additives", summary: "New regulations require all imported flavour compounds to carry detailed allergen declarations and country-of-origin codes by Q3. Industry bodies are urging a phased compliance window.", category: "Regulation", source: "Food Safety News NG", publishedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), sentiment: "neutral", imageKeyword: "food label regulation", readTime: 4 },
  { id: "4", headline: "Locust Bean (Iru) Identified as High-Value Probiotic Ingredient", summary: "Researchers at University of Lagos confirm that fermented locust bean contains beneficial Bacillus strains with strong gut-health properties, opening doors to functional food formulations.", category: "Ingredients", source: "Journal of African Food Science", publishedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "fermented beans africa", readTime: 3 },
  { id: "5", headline: "West Africa Cassava Processing Capacity Set to Double by 2026", summary: "A $200M investment across Nigeria, Ghana, and Côte d'Ivoire will modernise cassava starch and flour production, reducing post-harvest losses and boosting local food manufacturing.", category: "Food Tech", source: "AgriBusinessAfrica", publishedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "cassava processing africa", readTime: 3 },
  { id: "6", headline: "Moringa Powder Demand Surges as Nigerian Wellness Brands Scale Up", summary: "Domestic consumption of moringa-enriched products grew 34% in the last fiscal year as health-conscious urban consumers seek affordable functional superfoods.", category: "Market", source: "Food Navigator Africa", publishedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "moringa powder green", readTime: 2 },
  { id: "7", headline: "Palm Oil Sustainability Crisis Threatens Nigerian Export Revenues", summary: "Growing EU import restrictions on non-certified palm oil could cost Nigeria ₦180B in annual export revenue. Industry stakeholders call for urgent RSPO certification support.", category: "Sustainability", source: "Channels Business", publishedAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(), sentiment: "negative", imageKeyword: "palm oil plantation", readTime: 4 },
  { id: "8", headline: "Kuli-Kuli Brand Expands into Plant-Based Protein Snack Line", summary: "A Lagos-based food startup reformulates the traditional groundnut cake into a high-protein snack bar targeting gym-goers and urban professionals across West Africa.", category: "Innovation", source: "TechCabal Food", publishedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "peanut snack bar", readTime: 2 },
  { id: "9", headline: "Ogiri Fermentation Science Opens New Umami Flavour Pathways", summary: "Food scientists are isolating the dominant Bacillus species in ogiri (fermented castor seed) to develop standardised umami flavour concentrates for use in commercial seasonings.", category: "Food Tech", source: "Food Chemistry Africa", publishedAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "fermentation science lab", readTime: 4 },
  { id: "10", headline: "Nigerian Breadfruit Flour Gains Traction as Wheat Substitute", summary: "With wheat import costs at record highs, bakers across the south-west are adopting breadfruit flour blends that cut costs by up to 40% while maintaining texture and flavour.", category: "Ingredients", source: "BusinessDay Nigeria", publishedAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "breadfruit flour baking", readTime: 3 },
  { id: "11", headline: "E-Commerce Drives 60% Growth in Artisan Seasoning Brands", summary: "Small-batch seasoning producers from Aba and Onitsha are leveraging Jumia and social commerce to reach customers in the diaspora, with USA and UK recording the highest growth.", category: "Market", source: "Nairametrics", publishedAt: new Date(Date.now() - 11 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "spice market africa", readTime: 2 },
  { id: "12", headline: "Afang and Egusi Soups Inspire New Instant Meal Range in West Africa", summary: "Nestlé West Africa announces a premium instant soup line inspired by traditional Nigerian dishes, targeting the growing segment of urban consumers seeking convenient home-cooked flavours.", category: "Innovation", source: "Food Navigator Africa", publishedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(), sentiment: "positive", imageKeyword: "nigerian soup ingredients", readTime: 3 },
];

const MOCK_ITEMS: NewsItem[] = MOCK_ITEMS_RAW.map(item => ({
  ...item,
  imageUrl: buildImageUrl(item.imageKeyword),
  readMoreUrl: buildReadMoreUrl(item.headline),
}));

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;

async function fetchFromGroq(): Promise<NewsItem[]> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 3500,
      temperature: 0.75,
      messages: [
        {
          role: "system",
          content: "You are a food industry news aggregator specialising in Nigeria and West Africa. You always return valid JSON arrays with no extra text.",
        },
        {
          role: "user",
          content: `Generate 12 realistic, current news items focused on Nigeria and West Africa food industry. Today is ${new Date().toISOString()}.

Return ONLY a valid JSON array with exactly 12 objects. Each object must have:
- "id": "1" through "12"
- "headline": engaging string under 90 characters
- "summary": 2-3 sentences under 220 characters total
- "category": exactly one of: "Food Tech", "Market", "Regulation", "Sustainability", "Innovation", "Ingredients"
- "source": realistic Nigerian or African food/business publication (e.g. "BusinessDay Nigeria", "Nairametrics", "Food Navigator Africa", "TechCabal Food", "AgriBusinessAfrica", "Channels Business")
- "publishedAt": ISO 8601 datetime within the last 24 hours
- "sentiment": exactly one of: "positive", "neutral", "negative"
- "imageKeyword": 2-4 descriptive words for the visual (e.g. "jollof rice spice", "moringa powder", "palm oil mill")
- "readTime": integer between 1 and 4

Topics to cover (mix of these): new Nigerian flavour innovations, suya/jollof/egusi/peppersoup trends, local ingredient market prices, NAFDAC regulatory updates, African food export opportunities, cassava/yam/moringa R&D, West African plant-based food startups, fermentation of iru/ogiri/dawadawa, traditional recipe modernisation, food tech startups in Lagos/Accra, sustainability of palm oil and cocoa supply chains.
Return ONLY the JSON array. No markdown fences, no explanation, no extra text.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error(`Groq API error ${res.status}:`, JSON.stringify(errBody));
    throw new Error(`Groq API error ${res.status}: ${JSON.stringify(errBody)}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const raw = (data.choices?.[0]?.message?.content || "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  const items = JSON.parse(raw) as Omit<NewsItem, "imageUrl" | "readMoreUrl">[];
  if (!Array.isArray(items) || items.length === 0) throw new Error("Invalid response format");

  return items.map(item => ({
    ...item,
    imageUrl: buildImageUrl(item.imageKeyword),
    readMoreUrl: buildReadMoreUrl(item.headline),
  }));
}

router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  try {
    if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
      return;
    }

    if (!GROQ_API_KEY) {
      console.log("[DEV] No GROQ_API_KEY — serving mock news feed");
      if (!cache) cache = { items: MOCK_ITEMS, fetchedAt: Date.now() };
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
      return;
    }

    const items = await fetchFromGroq();
    cache = { items, fetchedAt: Date.now() };
    res.json({ items, fetchedAt: new Date(cache.fetchedAt).toISOString() });
  } catch (err) {
    console.error("Newsfeed error:", err);
    if (cache) {
      res.json({ items: cache.items, fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: true });
      return;
    }
    res.json({ items: MOCK_ITEMS, fetchedAt: new Date().toISOString(), stale: true });
  }
});

export default router;
