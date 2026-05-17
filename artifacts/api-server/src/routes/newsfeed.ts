import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

const GUARDIAN_API_KEY   = process.env.GUARDIAN_API_KEY;
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const CACHE_MS           = 10 * 60 * 1000;   // 10 min — RSS / Guardian
const AI_CACHE_MS        = 60 * 60 * 1000;   // 60 min — AI (cost-sensitive)

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
  id: "ai" | "ift" | "guardian";
  label: string;
  subtitle: string;
  items: NewsItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePubDate(pubDate: string | null | undefined): string {
  if (!pubDate) return new Date().toISOString();
  try {
    const d = new Date(pubDate);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function buildFallbackImageUrl(keyword: string): string {
  const seed = encodeURIComponent(keyword.replace(/\s+/g, "-").toLowerCase());
  return `https://picsum.photos/seed/${seed}/640/360`;
}

function mapToAppCategory(title: string, description: string | null): string {
  const text = `${title} ${description || ""}`.toLowerCase();
  if (/safety|regulation|nafdac|fda|standard|compliance|recall|ban|law|policy|permit|certif/.test(text)) return "Regulation";
  if (/sustain|environment|climate|organic|eco|green|waste|emission|carbon|renewable/.test(text))        return "Sustainability";
  if (/innovat|new product|launch|develop|creat|novel|breakthrough|patent|disrupt/.test(text))           return "Innovation";
  if (/ingredient|flavou?r|extract|compound|vitamin|mineral|antioxidant|enzyme|protein|probiotic|additive|seasoning/.test(text)) return "Ingredients";
  if (/market|trend|export|import|trade|price|revenue|growth|demand|consumer|retail|sales/.test(text))  return "Market";
  return "Food Tech";
}

// ─── RSS helpers ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
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
  imageUrl?: string;
}

function parseRssItems(xml: string): RssItem[] {
  const results: RssItem[] = [];
  const itemRegion = xml.replace(/^[\s\S]*?<channel[^>]*>/i, "");
  for (const match of itemRegion.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)) {
    const x = match[1];
    const title = stripHtml(extractTag(x, "title"));
    const link =
      extractTag(x, "link") ||
      x.match(/<link[^>]+href="([^"]+)"/i)?.[1] ||
      "";
    const descRaw = extractTag(x, "description") || extractTag(x, "content:encoded") || extractTag(x, "summary");
    const description = stripHtml(descRaw).slice(0, 400);
    const pubDate = extractTag(x, "pubDate") || extractTag(x, "published") || extractTag(x, "dc:date") || "";
    const imageUrl =
      x.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image[^"]*"/i)?.[1] ||
      x.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] ||
      descRaw.match(/<img[^>]+src="([^"]+)"/i)?.[1] ||
      undefined;
    if (title) results.push({ title, link, description, pubDate, imageUrl });
  }
  return results;
}

// ─── Static fallback articles (always available — no API key needed) ─────────

function staticArticles(): NewsItem[] {
  const base = Date.now();
  const ago = (mins: number) => new Date(base - mins * 60 * 1000).toISOString();
  return [
    {
      id: "static-0",
      headline: "Givaudan Launches West African Flavour Library for Local Food Manufacturers",
      summary: "Global flavour house Givaudan has unveiled over 200 authentic West African flavour profiles — including egusi, ogiri, and uda pepper — developed specifically for Nigerian and Ghanaian manufacturers scaling local taste profiles to industrial quantities.",
      category: "Ingredients", source: "Food Navigator Africa", publishedAt: ago(15),
      sentiment: "positive", imageKeyword: "west africa food flavours",
      imageUrl: buildFallbackImageUrl("west-africa-food-flavours"), readTime: 3,
    },
    {
      id: "static-1",
      headline: "NAFDAC Updates Labelling Regulations for Processed Food Products in Nigeria",
      summary: "Nigeria's food safety agency NAFDAC has issued revised labelling guidelines requiring front-of-pack nutrition information on all processed foods sold in Nigeria. Manufacturers have 18 months to comply, with mandatory allergen declarations now extended to 14 major allergen groups.",
      category: "Regulation", source: "NAFDAC Official", publishedAt: ago(40),
      sentiment: "neutral", imageKeyword: "food regulation label",
      imageUrl: buildFallbackImageUrl("food-regulation-label"), readTime: 4,
    },
    {
      id: "static-2",
      headline: "IFF and Kerry Group Partner on Next-Generation Savoury Seasoning Blends",
      summary: "International Flavors & Fragrances (IFF) and Kerry Group announced a co-development agreement to create clean-label savoury seasoning systems targeting the fast-growing West and East African processed snack markets, leveraging native spice profiles including suya, shito, and berbere.",
      category: "Innovation", source: "Food Business News", publishedAt: ago(90),
      sentiment: "positive", imageKeyword: "seasoning blend innovation",
      imageUrl: buildFallbackImageUrl("seasoning-blend-innovation"), readTime: 3,
    },
    {
      id: "static-3",
      headline: "Researchers Identify Novel Prebiotic Fibre in West African Locust Bean (Dawa-Dawa)",
      summary: "Scientists at the University of Ibadan have isolated a previously uncharacterised prebiotic oligosaccharide fraction in fermented locust bean (Parkia biglobosa), demonstrating significant bifidogenic activity in vitro. The finding opens new pathways for functional food formulations using indigenous African ingredients.",
      category: "Food Tech", source: "IFT.org", publishedAt: ago(120),
      sentiment: "positive", imageKeyword: "locust bean research",
      imageUrl: buildFallbackImageUrl("locust-bean-research"), readTime: 5,
    },
    {
      id: "static-4",
      headline: "Nigeria's Processed Food Market Set to Reach $12.4 Billion by 2027",
      summary: "A new Euromonitor report projects Nigeria's packaged food sector will grow at 8.3% CAGR through 2027, driven by urbanisation, rising middle-class consumption, and demand for affordable convenience foods. Seasoned noodles, extruded snacks, and flavoured crackers lead growth categories.",
      category: "Market", source: "Euromonitor International", publishedAt: ago(180),
      sentiment: "positive", imageKeyword: "nigeria food market growth",
      imageUrl: buildFallbackImageUrl("nigeria-food-market"), readTime: 4,
    },
    {
      id: "static-5",
      headline: "Symrise Develops Thermostable Flavour Encapsulation for High-Temperature Snack Dusting",
      summary: "Symrise has introduced a microencapsulation technology that retains flavour integrity through extrusion and high-heat frying processes up to 180°C. The system is specifically optimised for puffed corn snacks and cassava-based products common across West Africa.",
      category: "Ingredients", source: "Flavour & Fragrance Journal", publishedAt: ago(200),
      sentiment: "positive", imageKeyword: "flavour encapsulation snack",
      imageUrl: buildFallbackImageUrl("flavour-encapsulation-snack"), readTime: 3,
    },
    {
      id: "static-6",
      headline: "New Product Development: Moringa-Fortified Instant Seasoning Cubes Hit Nigerian Shelves",
      summary: "Start-up NutriSeasons Nigeria has launched a line of moringa-fortified seasoning cubes targeting health-conscious urban consumers. The product achieves 15% of the adult daily iron RDA per cube while maintaining the bold umami profile of conventional bouillon, validated through consumer sensory panels in Lagos and Abuja.",
      category: "Innovation", source: "BusinessDay Nigeria", publishedAt: ago(240),
      sentiment: "positive", imageKeyword: "moringa seasoning nigeria",
      imageUrl: buildFallbackImageUrl("moringa-seasoning-nigeria"), readTime: 3,
    },
    {
      id: "static-7",
      headline: "Firmenich Reports Surge in Demand for Tropical Sweet Flavours Across Sub-Saharan Africa",
      summary: "Firmenich's 2025 consumer insight report reveals a 34% year-on-year increase in demand for tropical sweet profiles — mango, coconut-pineapple, and baobab — in beverages, confectionery, and dairy products across Sub-Saharan Africa, with Nigeria and Kenya as the fastest-growing markets.",
      category: "Market", source: "Firmenich Insights", publishedAt: ago(280),
      sentiment: "positive", imageKeyword: "tropical sweet flavour africa",
      imageUrl: buildFallbackImageUrl("tropical-sweet-flavour"), readTime: 3,
    },
    {
      id: "static-8",
      headline: "NIFST Calls for Mandatory Food Science Curriculum Reform in Nigerian Universities",
      summary: "The Nigerian Institute of Food Science and Technology (NIFST) has submitted a proposal to the National Universities Commission to update food science curricula, emphasising formulation science, sensory evaluation, and regulatory compliance training to better prepare graduates for industry roles.",
      category: "Regulation", source: "NIFST Bulletin", publishedAt: ago(320),
      sentiment: "neutral", imageKeyword: "food science education nigeria",
      imageUrl: buildFallbackImageUrl("food-science-education"), readTime: 4,
    },
    {
      id: "static-9",
      headline: "Kerry Group Achieves Breakthrough in Low-Sodium Savoury Taste Modulation",
      summary: "Kerry Group's TasteSense technology has demonstrated a 35% sodium reduction in savoury seasonings while maintaining full flavour intensity, confirmed in an independent blind taste panel of 400 consumers. The technology targets WHO sodium reduction targets and is now available for licensing to African food manufacturers.",
      category: "Food Tech", source: "Food Technology Magazine", publishedAt: ago(360),
      sentiment: "positive", imageKeyword: "low sodium food technology",
      imageUrl: buildFallbackImageUrl("low-sodium-technology"), readTime: 4,
    },
  ];
}

// ─── Caches ───────────────────────────────────────────────────────────────────

let aiCache:       { items: NewsItem[]; fetchedAt: number } | null = null;
let iftCache:      { items: NewsItem[]; fetchedAt: number } | null = null;
let guardianCache: { items: NewsItem[]; fetchedAt: number } | null = null;

// ─── AI-powered carousel (Anthropic) ─────────────────────────────────────────

const AI_SYSTEM = `You are a food industry news curator for a professional food R&D platform used by Nigerian food scientists and product developers.`;

const AI_PROMPT = `Generate exactly 12 realistic, informative food industry news article summaries published today.

Cover ALL of the following topics (at least 1 article each, some can overlap):
- Food Science & Research developments and discoveries
- New Product Development in food science
- Food Ingredient science breakthroughs or updates
- Food Formulations, Seasonings & Flavour innovations
- Sweet and Savoury Product trends
- Nigeria Trending Processed Food products and brands
- Trending Food organisations and industry bodies (IFT, NIFST, CAC Nigeria)
- Top leading flavour houses news (Givaudan, IFF, Firmenich, Symrise, Kerry, Treatt, Robertet)
- New food discovery articles (novel ingredients, superfoods, bioactives)
- Nigeria and West Africa flavours and indigenous ingredients

Return ONLY a JSON array with exactly 12 objects, each with this structure:
{
  "headline": "specific, compelling news headline (max 120 chars)",
  "summary": "2–3 informative sentences describing the news in detail",
  "category": "one of exactly: Food Tech | Innovation | Ingredients | Market | Regulation | Sustainability",
  "source": "realistic source (e.g. Food Navigator Africa, BusinessDay Nigeria, IFT.org, Mintel, NAFDAC, Food Business News, Flavour & Fragrance Journal)",
  "sentiment": "positive | neutral | negative",
  "imageKeyword": "2–3 word image keyword"
}

Make articles sound like real industry news. Include specific Nigerian/West African content in at least 4 articles.
Reference real companies, ingredients, and current trends. Vary the sentiments (mostly positive/neutral, 1–2 negative).
Return ONLY the JSON array — no markdown fences, no preamble, no trailing text.`;

async function fetchFromAI(): Promise<NewsItem[]> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: AI_SYSTEM,
      messages: [{ role: "user", content: AI_PROMPT }],
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = (data.content.find(c => c.type === "text")?.text ?? "").trim();

  // Robust parse: strip markdown fences if present, then extract JSON array
  let parsed: unknown[];
  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(stripped);
  } catch {
    const m = text.match(/(\[[\s\S]*\])/);
    if (!m) throw new Error("AI response was not valid JSON");
    parsed = JSON.parse(m[1]);
  }

  if (!Array.isArray(parsed)) throw new Error("AI response was not an array");

  const now = Date.now();
  return (parsed as any[]).slice(0, 12).map((item, idx): NewsItem => {
    const kw = (item.imageKeyword || item.category || "food science").toString();
    return {
      id: `ai-${idx}`,
      headline: String(item.headline || "Food Industry Update"),
      summary: String(item.summary || ""),
      category: String(item.category || "Food Tech"),
      source: String(item.source || "Food Intelligence"),
      publishedAt: new Date(now - idx * 18 * 60 * 1000).toISOString(), // stagger timestamps
      sentiment: (["positive", "neutral", "negative"].includes(item.sentiment) ? item.sentiment : "neutral") as NewsItem["sentiment"],
      imageKeyword: kw,
      imageUrl: buildFallbackImageUrl(kw),
      readTime: Math.max(2, Math.min(8, Math.ceil(String(item.summary || "").split(/\s+/).filter(Boolean).length / 45))),
    };
  });
}

// ─── IFT.org RSS (fallback when no Anthropic key) ────────────────────────────

const IFT_FEED_URLS = [
  "https://www.ift.org/rss",
  "https://www.ift.org/rss/news",
  "https://www.ift.org/rss/food-technology",
];

async function fetchFromIFT(): Promise<NewsItem[]> {
  let lastError: unknown;
  for (const feedUrl of IFT_FEED_URLS) {
    try {
      const res = await fetch(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const parsed = parseRssItems(xml);
      if (parsed.length === 0) { lastError = new Error("Empty feed"); continue; }

      const items = parsed.slice(0, 12).map((article, idx): NewsItem => {
        const category = mapToAppCategory(article.title, article.description);
        const wordCount = article.description.split(/\s+/).filter(Boolean).length;
        return {
          id: `ift-${idx}`,
          headline: article.title,
          summary: article.description.length > 200
            ? article.description.slice(0, 200).trimEnd() + "…"
            : article.description || article.title,
          category,
          source: "IFT.org",
          publishedAt: parsePubDate(article.pubDate),
          sentiment: "neutral",
          imageKeyword: category.toLowerCase() + " food science",
          imageUrl: article.imageUrl || buildFallbackImageUrl(category.toLowerCase() + " food science"),
          readMoreUrl: article.link || undefined,
          readTime: Math.max(2, Math.min(10, Math.ceil(wordCount / 50))),
        };
      });
      console.log(`[IFT] Fetched ${items.length} articles from ${feedUrl}`);
      return items;
    } catch (err) {
      lastError = err;
      console.warn(`[IFT] Feed ${feedUrl} failed:`, err);
    }
  }
  throw lastError || new Error("All IFT feeds failed");
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

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Guardian API ${res.status}`);
  const data = await res.json() as { response: { status: string; results: GuardianArticle[] } };
  if (data.response.status !== "ok") throw new Error("Invalid Guardian response");

  return data.response.results.map((article, idx): NewsItem => {
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
      imageUrl: article.fields?.thumbnail || buildFallbackImageUrl(category.toLowerCase() + " food"),
      readMoreUrl: article.webUrl,
      readTime: Math.max(3, Math.min(10, Math.ceil(wordCount / 50))),
    };
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  const now = Date.now();
  const sections: NewsSection[] = [];

  // ── Carousel: AI-powered (primary) or IFT RSS (fallback) ─────────────────
  if (ANTHROPIC_API_KEY) {
    try {
      if (aiCache && now - aiCache.fetchedAt < AI_CACHE_MS) {
        sections.push({ id: "ai", label: "Food Intelligence", subtitle: "AI · Food Science & Industry Insights", items: aiCache.items });
      } else {
        const items = await fetchFromAI();
        aiCache = { items, fetchedAt: now };
        sections.push({ id: "ai", label: "Food Intelligence", subtitle: "AI · Food Science & Industry Insights", items });
        console.log(`[AI] Generated ${items.length} news articles`);
      }
    } catch (err) {
      console.error("[AI] News generation failed:", err);
      if (aiCache && aiCache.items.length > 0) {
        console.log("[AI] Serving stale cache");
        sections.push({ id: "ai", label: "Food Intelligence", subtitle: "AI · Food Science & Industry Insights", items: aiCache.items });
      } else {
        // Fall through to IFT RSS below
        console.log("[AI] No cache — falling back to IFT RSS");
      }
    }
  }

  // IFT RSS: used only if AI is not configured or AI+cache both failed
  if (!sections.some(s => s.id === "ai")) {
    try {
      if (iftCache && now - iftCache.fetchedAt < CACHE_MS) {
        sections.push({ id: "ift", label: "Food Science Today", subtitle: "IFT.org · Institute of Food Technologists", items: iftCache.items });
      } else {
        const items = await fetchFromIFT();
        iftCache = { items, fetchedAt: now };
        sections.push({ id: "ift", label: "Food Science Today", subtitle: "IFT.org · Institute of Food Technologists", items });
      }
    } catch (err) {
      console.error("[IFT] Fetch failed:", err);
      if (iftCache && iftCache.items.length > 0) {
        sections.push({ id: "ift", label: "Food Science Today", subtitle: "IFT.org · Institute of Food Technologists", items: iftCache.items });
      }
    }
  }

  // Static fallback: guarantees the carousel always has content
  if (!sections.some(s => s.id === "ai" || s.id === "ift")) {
    console.log("[Newsfeed] Using static fallback articles");
    sections.unshift({ id: "ai", label: "Food Intelligence", subtitle: "Curated · Food Science & Industry Insights", items: staticArticles() });
  }

  // ── Guardian (editorial — only if key present) ────────────────────────────
  if (GUARDIAN_API_KEY) {
    try {
      if (guardianCache && now - guardianCache.fetchedAt < CACHE_MS) {
        sections.push({ id: "guardian", label: "Industry Spotlight", subtitle: "The Guardian", items: guardianCache.items });
      } else {
        const items = await fetchFromGuardian();
        guardianCache = { items, fetchedAt: now };
        sections.push({ id: "guardian", label: "Industry Spotlight", subtitle: "The Guardian", items });
      }
    } catch (err) {
      console.error("[Guardian] Fetch failed:", err);
      if (guardianCache && guardianCache.items.length > 0) {
        sections.push({ id: "guardian", label: "Industry Spotlight", subtitle: "The Guardian", items: guardianCache.items });
      }
    }
  }

  res.json({ sections, fetchedAt: new Date(now).toISOString() });
});

export default router;
