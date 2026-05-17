import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY;
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

export interface NewsSection {
  id: "ift" | "guardian" | "newsdata";
  label: string;
  subtitle: string;
  items: NewsItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePubDate(pubDate: string | null | undefined): string {
  if (!pubDate) return new Date().toISOString();
  try {
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

function buildFallbackImageUrl(keyword: string): string {
  // Seed-based so the same keyword always returns the same image
  const seed = encodeURIComponent(keyword.replace(/\s+/g, "-").toLowerCase());
  return `https://picsum.photos/seed/${seed}/640/360`;
}

function buildReadMoreUrl(headline: string): string {
  return `https://news.google.com/search?q=${encodeURIComponent(headline)}&hl=en-NG&gl=NG`;
}

const FOOD_KEYWORDS = [
  "food", "nutrition", "ingredient", "flavour", "flavor", "recipe",
  "diet", "protein", "supplement", "ferment", "processing", "packaging",
  "nafdac", "fda", "agriculture", "crop", "harvest", "beverage", "drink",
  "spice", "seasoning", "additive", "preservative", "emulsifier", "enzyme",
  "probiotic", "microbiome", "allergen", "gluten", "sugar", "fat", "carbohydrate",
  "vitamin", "mineral", "antioxidant", "flavoring", "culinary", "gastronomy",
  "agri-food", "agrifood", "food-grade", "snack", "cereal", "grain", "dairy",
  "meat", "poultry", "seafood", "plant-based", "vegan", "fortif",
];

function isFoodRelated(title: string, description: string | null): boolean {
  const text = `${title} ${description || ""}`.toLowerCase();
  return FOOD_KEYWORDS.some(kw => text.includes(kw));
}

function mapToAppCategory(title: string, description: string | null): string {
  const text = `${title} ${description || ""}`.toLowerCase();
  if (/safety|regulation|nafdac|fda|standard|compliance|recall|ban|law|policy|permit|certif/.test(text)) return "Regulation";
  if (/sustain|environment|climate|organic|eco|green|waste|emission|carbon|renewable/.test(text)) return "Sustainability";
  if (/innovat|new product|launch|develop|creat|novel|breakthrough|patent|disrupt/.test(text)) return "Innovation";
  if (/ingredient|flavour|flavor|extract|compound|vitamin|mineral|antioxidant|enzyme|protein|probiotic|additive/.test(text)) return "Ingredients";
  if (/market|trend|export|import|trade|price|revenue|growth|demand|consumer|retail|sales/.test(text)) return "Market";
  return "Food Tech";
}

// ─── RSS Parser (no external dependency) ─────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function extractTag(itemXml: string, tag: string): string {
  const m = itemXml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  category?: string;
  imageUrl?: string;
}

function parseRssItems(xml: string): RssItem[] {
  const results: RssItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = match[1];
    const title = stripHtml(extractTag(x, "title"));
    const link = extractTag(x, "link") || x.match(/<link\s*\/?>([^<]+)<\/link>/)?.[1]?.trim() || "";
    const descRaw = extractTag(x, "description");
    const description = stripHtml(descRaw).slice(0, 400);
    const pubDate = extractTag(x, "pubDate");
    const category = extractTag(x, "category") || undefined;
    const imageUrl =
      x.match(/<enclosure[^>]+url="([^"]+)"[^>]+type="image[^"]*"/i)?.[1] ||
      x.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] ||
      descRaw.match(/<img[^>]+src="([^"]+)"/i)?.[1] ||
      undefined;
    if (title && link) results.push({ title, link, description, pubDate, category, imageUrl });
  }
  return results;
}

// ─── Mock data (Nigeria/Africa focus, used when no API keys are set) ──────────

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
  imageUrl: buildFallbackImageUrl(item.imageKeyword),
  readMoreUrl: buildReadMoreUrl(item.headline),
}));

// ─── Per-source caches ────────────────────────────────────────────────────────

let iftCache:      { items: NewsItem[]; fetchedAt: number } | null = null;
let guardianCache: { items: NewsItem[]; fetchedAt: number } | null = null;
let newsdataCache: { items: NewsItem[]; fetchedAt: number } | null = null;

// ─── IFT.org RSS ──────────────────────────────────────────────────────────────

async function fetchFromIFT(): Promise<NewsItem[]> {
  const res = await fetch("https://www.ift.org/rss", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RDIntelligence/1.0)" },
  });
  if (!res.ok) throw new Error(`IFT RSS ${res.status}`);
  const xml = await res.text();

  return parseRssItems(xml)
    .filter(a => isFoodRelated(a.title, a.description))
    .slice(0, 12)
    .map((article, idx): NewsItem => {
      const category = mapToAppCategory(article.title, article.description);
      const wordCount = article.description.split(/\s+/).filter(Boolean).length;
      return {
        id: `ift-${idx}`,
        headline: article.title,
        summary: article.description.length > 200
          ? article.description.slice(0, 200).trimEnd() + "…"
          : article.description,
        category,
        source: "IFT.org",
        publishedAt: parsePubDate(article.pubDate),
        sentiment: "neutral",
        imageKeyword: category.toLowerCase() + " food science",
        imageUrl: article.imageUrl || buildFallbackImageUrl(category.toLowerCase() + " food science"),
        readMoreUrl: article.link,
        readTime: Math.max(2, Math.min(10, Math.ceil(wordCount / 50))),
      };
    });
}

// ─── The Guardian API ─────────────────────────────────────────────────────────

interface GuardianArticle {
  id: string;
  webTitle: string;
  webUrl: string;
  webPublicationDate: string;
  fields?: { trailText?: string; thumbnail?: string };
}

async function fetchFromGuardian(): Promise<NewsItem[]> {
  const q = [
    "food science", "food safety", "food innovation",
    "food technology", "food ingredient", "food research",
    "food formulation", "food development",
  ].join(" OR ");

  const url =
    `https://content.guardianapis.com/search` +
    `?q=${encodeURIComponent(q)}` +
    `&show-fields=trailText,thumbnail` +
    `&order-by=newest` +
    `&page-size=12` +
    `&api-key=${GUARDIAN_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Guardian API ${res.status}`);
  const data = await res.json() as { response: { status: string; results: GuardianArticle[] } };
  if (data.response.status !== "ok") throw new Error("Invalid Guardian response");

  return data.response.results
    .filter(a => isFoodRelated(a.webTitle, a.fields?.trailText || null))
    .map((article, idx): NewsItem => {
      const description = article.fields?.trailText || "";
      const category = mapToAppCategory(article.webTitle, description);
      const wordCount = description.split(/\s+/).filter(Boolean).length;
      return {
        id: `guardian-${idx}`,
        headline: article.webTitle,
        summary: description.length > 220 ? description.slice(0, 220).trimEnd() + "…" : description,
        category,
        source: "The Guardian",
        publishedAt: article.webPublicationDate,
        sentiment: "neutral",
        imageKeyword: category.toLowerCase() + " food",
        imageUrl: article.fields?.thumbnail,
        readMoreUrl: article.webUrl,
        readTime: Math.max(3, Math.min(10, Math.ceil(wordCount / 50))),
      };
    });
}

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
  const query = [
    "food science", "food safety", "food innovation",
    "food research", "food development", "food technology",
    "food ingredient", "food formulation", "food regulation",
    "food sustainability", "food processing",
  ].join(" OR ");

  const url =
    `https://newsdata.io/api/1/news` +
    `?apikey=${NEWSDATA_API_KEY}` +
    `&q=${encodeURIComponent(query)}` +
    `&language=en` +
    `&category=science,technology,health,business`;

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
    .filter(a => a.title && a.link && isFoodRelated(a.title, a.description))
    .map((article, idx): NewsItem => {
      const description = article.description || "";
      const summary = description.length > 120
        ? description.slice(0, 120).trimEnd() + "…"
        : description;
      const category = mapToAppCategory(article.title, article.description);
      const wordCount = description.split(/\s+/).filter(Boolean).length;
      return {
        id: article.article_id || String(idx + 1),
        headline: article.title,
        summary,
        category,
        source: article.source_name || article.source_id,
        publishedAt: parsePubDate(article.pubDate),
        sentiment: mapSentiment(article.sentiment),
        imageKeyword: category.toLowerCase() + " food",
        imageUrl: article.image_url || buildFallbackImageUrl(category.toLowerCase() + " food"),
        readMoreUrl: article.link,
        readTime: Math.max(1, Math.min(5, Math.ceil(wordCount / 50))),
      };
    });
}

// ─── Groq (fallback) ──────────────────────────────────────────────────────────

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
          content: `Generate 12 realistic news items strictly about food development, food innovation, food safety, food research and development, and food science — focused on Nigeria and West Africa. Today is ${new Date().toISOString()}.

Topics must only cover: new food product launches, food ingredient breakthroughs, food safety regulations, food processing technology, R&D in food formulation, food sustainability, novel flavours or food science discoveries. Do NOT include unrelated news.

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
    imageUrl: buildFallbackImageUrl(item.imageKeyword),
    readMoreUrl: buildReadMoreUrl(item.headline),
  }));
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  const now = Date.now();

  const [iftResult, guardianResult, newsdataResult] = await Promise.allSettled([
    // IFT — always try, no key needed
    (async () => {
      if (iftCache && now - iftCache.fetchedAt < CACHE_MS) return iftCache.items;
      const items = await fetchFromIFT();
      iftCache = { items, fetchedAt: now };
      return items;
    })(),

    // Guardian — only if key present
    GUARDIAN_API_KEY
      ? (async () => {
          if (guardianCache && now - guardianCache.fetchedAt < CACHE_MS) return guardianCache.items;
          const items = await fetchFromGuardian();
          guardianCache = { items, fetchedAt: now };
          return items;
        })()
      : Promise.reject(new Error("No GUARDIAN_API_KEY")),

    // NewsData / Groq / Mock — always has a result
    (async () => {
      if (newsdataCache && now - newsdataCache.fetchedAt < CACHE_MS) return newsdataCache.items;
      let items: NewsItem[];
      if (NEWSDATA_API_KEY) {
        items = await fetchFromNewsData();
      } else if (GROQ_API_KEY) {
        console.log("[INFO] No NEWSDATA_API_KEY — falling back to Groq");
        items = await fetchFromGroq();
      } else {
        console.log("[DEV] No API keys — serving mock news feed");
        items = MOCK_ITEMS;
      }
      newsdataCache = { items, fetchedAt: now };
      return items;
    })(),
  ]);

  const sections: NewsSection[] = [];

  if (iftResult.status === "fulfilled" && iftResult.value.length > 0) {
    sections.push({ id: "ift", label: "Research Digest", subtitle: "IFT.org · Food Science & Technology", items: iftResult.value });
  } else if (iftResult.status === "rejected") {
    console.error("IFT feed error:", iftResult.reason);
  }

  if (guardianResult.status === "fulfilled" && guardianResult.value.length > 0) {
    sections.push({ id: "guardian", label: "Industry Spotlight", subtitle: "The Guardian", items: guardianResult.value });
  } else if (guardianResult.status === "rejected" && GUARDIAN_API_KEY) {
    console.error("Guardian feed error:", guardianResult.reason);
  }

  const newsdataItems =
    newsdataResult.status === "fulfilled"
      ? newsdataResult.value
      : newsdataCache?.items || MOCK_ITEMS;

  if (newsdataResult.status === "rejected" && !newsdataCache) {
    console.error("NewsData/Groq error:", newsdataResult.reason);
    newsdataCache = { items: MOCK_ITEMS, fetchedAt: now };
  }

  sections.push({
    id: "newsdata",
    label: "Market Pulse",
    subtitle: NEWSDATA_API_KEY ? "NewsData.io" : "Curated Feed",
    items: newsdataItems,
  });

  res.json({ sections, fetchedAt: new Date(now).toISOString() });
});

export default router;
