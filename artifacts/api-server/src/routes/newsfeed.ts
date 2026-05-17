import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
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
  const seed = encodeURIComponent(keyword.replace(/\s+/g, "-").toLowerCase());
  return `https://picsum.photos/seed/${seed}/640/360`;
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
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
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
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = match[1];
    const title = stripHtml(extractTag(x, "title"));
    const link = extractTag(x, "link") || x.match(/<link\s*\/?>([^<]+)<\/link>/)?.[1]?.trim() || "";
    const descRaw = extractTag(x, "description");
    const description = stripHtml(descRaw).slice(0, 400);
    const pubDate = extractTag(x, "pubDate");
    const imageUrl =
      x.match(/<enclosure[^>]+url="([^"]+)"[^>]+type="image[^"]*"/i)?.[1] ||
      x.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] ||
      descRaw.match(/<img[^>]+src="([^"]+)"/i)?.[1] ||
      undefined;
    if (title && link) results.push({ title, link, description, pubDate, imageUrl });
  }
  return results;
}

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
        imageUrl: article.fields?.thumbnail || buildFallbackImageUrl(category.toLowerCase() + " food"),
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

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  const now = Date.now();

  const [iftResult, guardianResult, newsdataResult] = await Promise.allSettled([
    // IFT — always fetch, drives the carousel
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

    // NewsData — only if key present, no mock/AI fallback
    NEWSDATA_API_KEY
      ? (async () => {
          if (newsdataCache && now - newsdataCache.fetchedAt < CACHE_MS) return newsdataCache.items;
          const items = await fetchFromNewsData();
          newsdataCache = { items, fetchedAt: now };
          return items;
        })()
      : Promise.reject(new Error("No NEWSDATA_API_KEY")),
  ]);

  const sections: NewsSection[] = [];

  // IFT first — powers the top carousel
  if (iftResult.status === "fulfilled" && iftResult.value.length > 0) {
    sections.push({ id: "ift", label: "Food Science Today", subtitle: "IFT.org · Institute of Food Technologists", items: iftResult.value });
  } else if (iftResult.status === "rejected") {
    console.error("IFT feed error:", iftResult.reason);
  }

  if (guardianResult.status === "fulfilled" && guardianResult.value.length > 0) {
    sections.push({ id: "guardian", label: "Industry Spotlight", subtitle: "The Guardian", items: guardianResult.value });
  } else if (guardianResult.status === "rejected" && GUARDIAN_API_KEY) {
    console.error("Guardian feed error:", guardianResult.reason);
  }

  if (newsdataResult.status === "fulfilled" && newsdataResult.value.length > 0) {
    sections.push({ id: "newsdata", label: "Market Pulse", subtitle: "NewsData.io", items: newsdataResult.value });
  } else if (newsdataResult.status === "rejected" && NEWSDATA_API_KEY) {
    console.error("NewsData error:", newsdataResult.reason);
  }

  res.json({ sections, fetchedAt: new Date(now).toISOString() });
});

export default router;
