import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const NEWS_API_KEY     = process.env.NEWS_API_KEY;
const GNEWS_API_KEY    = process.env.GNEWS_API_KEY;
const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY;
const ELSEVIER_API_KEY = process.env.ELSEVIER_API_KEY;

const CACHE_MS = 3 * 60 * 60 * 1000; // 3 hours

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
  id: "newsapi" | "ift" | "guardian" | "gnews" | "elsevier";
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

function readTimeFromText(text: string): number {
  return Math.max(2, Math.min(10, Math.ceil(text.split(/\s+/).filter(Boolean).length / 50)));
}

// ─── RSS helpers (IFT fallback) ───────────────────────────────────────────────

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

function parseRssItems(xml: string) {
  const results: { title: string; link: string; description: string; pubDate: string; imageUrl?: string }[] = [];
  const region = xml.replace(/^[\s\S]*?<channel[^>]*>/i, "");
  for (const match of region.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)) {
    const x = match[1];
    const title = stripHtml(extractTag(x, "title"));
    const link = extractTag(x, "link") || x.match(/<link[^>]+href="([^"]+)"/i)?.[1] || "";
    const descRaw = extractTag(x, "description") || extractTag(x, "content:encoded") || extractTag(x, "summary");
    const description = stripHtml(descRaw).slice(0, 400);
    const pubDate = extractTag(x, "pubDate") || extractTag(x, "published") || extractTag(x, "dc:date") || "";
    const imageUrl =
      x.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image[^"]*"/i)?.[1] ||
      x.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] ||
      descRaw.match(/<img[^>]+src="([^"]+)"/i)?.[1] || undefined;
    if (title) results.push({ title, link, description, pubDate, imageUrl });
  }
  return results;
}

// ─── DB-persistent cache ─────────────────────────────────────────────────────
// Articles are stored in the newsfeed_cache table so they survive server
// restarts. The in-memory layer is kept as a hot-path shortcut to avoid a DB
// round-trip on every request within the same process lifetime.

const memCache = new Map<string, { items: NewsItem[]; fetchedAt: number }>();

async function getCached(sectionId: string, query = ""): Promise<{ items: NewsItem[]; fetchedAt: number } | null> {
  // 1. Try in-memory first (fastest path)
  const key = `${sectionId}:${query}`;
  const mem = memCache.get(key);
  if (mem) return mem;

  // 2. Try DB (survives restarts)
  try {
    const rows = await db.execute(sql`
      SELECT items, fetched_at FROM newsfeed_cache
      WHERE section_id = ${sectionId} AND query = ${query}
      LIMIT 1
    `);
    const row = (rows as any).rows?.[0] ?? (rows as any)[0];
    if (row) {
      const entry = { items: row.items as NewsItem[], fetchedAt: new Date(row.fetched_at).getTime() };
      memCache.set(key, entry); // warm the in-memory cache too
      return entry;
    }
  } catch { /* DB not ready yet — fall through */ }
  return null;
}

async function setCached(sectionId: string, items: NewsItem[], query = ""): Promise<void> {
  const key = `${sectionId}:${query}`;
  const entry = { items, fetchedAt: Date.now() };
  memCache.set(key, entry);

  try {
    await db.execute(sql`
      INSERT INTO newsfeed_cache (section_id, query, items, fetched_at)
      VALUES (${sectionId}, ${query}, ${JSON.stringify(items)}::jsonb, NOW())
      ON CONFLICT (section_id, query)
      DO UPDATE SET items = EXCLUDED.items, fetched_at = EXCLUDED.fetched_at
    `);
  } catch { /* non-fatal — in-memory cache still works */ }
}

async function getStale(sectionId: string, query = ""): Promise<NewsItem[] | null> {
  try {
    const rows = await db.execute(sql`
      SELECT items FROM newsfeed_cache WHERE section_id = ${sectionId} AND query = ${query} LIMIT 1
    `);
    const row = (rows as any).rows?.[0] ?? (rows as any)[0];
    return row ? (row.items as NewsItem[]) : null;
  } catch { return null; }
}

// ─── NewsAPI (carousel primary) ───────────────────────────────────────────────

interface NewsApiArticle {
  source: { id: string | null; name: string };
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
}

const NEWS_API_DEFAULT_Q = `(Nigeria OR "West Africa") AND ("food technology" OR seasonings OR flavours OR "new product development" OR snacks OR beverages OR dairy OR bakery)`;

async function fetchFromNewsAPI(customQ?: string): Promise<NewsItem[]> {
  const q = encodeURIComponent(customQ || NEWS_API_DEFAULT_Q);
  const url =
    `https://newsapi.org/v2/everything` +
    `?q=${q}&sortBy=publishedAt&language=en` +
    `&apiKey=${NEWS_API_KEY}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Zentryx-RD/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`NewsAPI ${res.status}`);

  const data = await res.json() as { status: string; articles: NewsApiArticle[] };
  if (data.status !== "ok") throw new Error(`NewsAPI returned status: ${data.status}`);

  return data.articles
    .filter(a => a.title && a.title !== "[Removed]" && !a.title.includes("[Removed]"))
    .slice(0, 12)
    .map((article, idx): NewsItem => {
      const desc = article.description || "";
      const category = mapToAppCategory(article.title, desc);
      const keyword = category.toLowerCase() + " food";
      return {
        id: `newsapi-${idx}`,
        headline: article.title,
        summary: desc.length > 220 ? desc.slice(0, 220).trimEnd() + "…" : desc || article.title,
        category,
        source: article.source?.name || "NewsAPI",
        publishedAt: parsePubDate(article.publishedAt),
        sentiment: "neutral",
        imageKeyword: keyword,
        imageUrl: article.urlToImage || buildFallbackImageUrl(keyword),
        readMoreUrl: article.url || undefined,
        readTime: readTimeFromText(desc),
      };
    });
}

// ─── IFT RSS (carousel fallback when NewsAPI fails) ───────────────────────────

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
          readTime: readTimeFromText(article.description),
        };
      });
      console.log(`[IFT] Fetched ${items.length} articles from ${feedUrl}`);
      return items;
    } catch (err) {
      lastError = err;
      console.warn(`[IFT] ${feedUrl} failed:`, err);
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

const GUARDIAN_DEFAULT_Q = [
  "food science", "food safety", "food innovation", "food technology",
  "food ingredient", "food research", "food formulation", "food development",
].join(" OR ");

async function fetchFromGuardian(customQ?: string): Promise<NewsItem[]> {
  const q = customQ || GUARDIAN_DEFAULT_Q;

  const url =
    `https://content.guardianapis.com/search` +
    `?q=${encodeURIComponent(q)}&show-fields=trailText,thumbnail` +
    `&order-by=newest&page-size=12&api-key=${GUARDIAN_API_KEY}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Guardian API ${res.status}`);
  const data = await res.json() as { response: { status: string; results: GuardianArticle[] } };
  if (data.response.status !== "ok") throw new Error("Invalid Guardian response");

  return data.response.results.map((article, idx): NewsItem => {
    const description = article.fields?.trailText || "";
    const category = mapToAppCategory(article.webTitle, description);
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
      readTime: readTimeFromText(description),
    };
  });
}

// ─── GNews API ────────────────────────────────────────────────────────────────

interface GNewsArticle {
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  image: string | null;
  publishedAt: string;
  source: { name: string; url: string };
}

async function fetchFromGNews(): Promise<NewsItem[]> {
  const q = encodeURIComponent(
    `food OR flavour OR seasoning OR snack OR beverage OR dairy OR bakery OR "Nigeria food" OR "West Africa food"`
  );
  const url =
    `https://gnews.io/api/v4/search` +
    `?q=${q}&lang=en&max=10` +
    `&apikey=${GNEWS_API_KEY.trim()}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Zentryx-RD/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GNews API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as { articles?: GNewsArticle[]; errors?: string[] };

  if (data.errors?.length) throw new Error(`GNews error: ${data.errors[0]}`);
  if (!Array.isArray(data.articles)) throw new Error("GNews: no articles array in response");

  return data.articles
    .filter(a => a.title)
    .slice(0, 10)
    .map((article, idx): NewsItem => {
      const desc = article.description || article.content?.slice(0, 300) || "";
      const category = mapToAppCategory(article.title, desc);
      const keyword = category.toLowerCase() + " flavour";
      return {
        id: `gnews-${idx}`,
        headline: article.title,
        summary: desc.length > 220 ? desc.slice(0, 220).trimEnd() + "…" : desc || article.title,
        category,
        source: article.source?.name || "GNews",
        publishedAt: parsePubDate(article.publishedAt),
        sentiment: "neutral",
        imageKeyword: keyword,
        imageUrl: article.image || buildFallbackImageUrl(keyword),
        readMoreUrl: article.url || undefined,
        readTime: readTimeFromText(desc),
      };
    });
}

// ─── Elsevier ScienceDirect API ───────────────────────────────────────────────

interface ElsevierEntry {
  "dc:title"?: string;
  "dc:description"?: string;
  "prism:url"?: string;
  "prism:coverDate"?: string;
  "prism:publicationName"?: string;
  "dc:creator"?: string;
  "openaccess"?: string | boolean;
}

async function fetchFromElsevier(customQ?: string): Promise<NewsItem[]> {
  const query = customQ ||
    `food flavour seasoning ingredient innovation food technology Nigeria`;

  const url =
    `https://api.elsevier.com/content/search/sciencedirect` +
    `?query=${encodeURIComponent(query)}&count=10&sort=date`;

  const res = await fetch(url, {
    headers: {
      "X-ELS-APIKey": ELSEVIER_API_KEY!,
      "Accept": "application/json",
      "User-Agent": "Zentryx-RD/1.0",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Elsevier API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    "search-results"?: { entry?: ElsevierEntry[] };
  };

  const entries = data["search-results"]?.entry ?? [];
  if (!entries.length) throw new Error("Elsevier: no entries in response");

  return entries
    .filter(e => e["dc:title"])
    .slice(0, 10)
    .map((entry, idx): NewsItem => {
      const title = entry["dc:title"] || "";
      const desc = entry["dc:description"] || "";
      const journal = entry["prism:publicationName"] || "Elsevier";
      const category = mapToAppCategory(title, desc);
      const keyword = category.toLowerCase() + " science";
      return {
        id: `elsevier-${idx}`,
        headline: title,
        summary: desc.length > 220 ? desc.slice(0, 220).trimEnd() + "…" : desc || title,
        category,
        source: journal,
        publishedAt: parsePubDate(entry["prism:coverDate"]),
        sentiment: "neutral",
        imageKeyword: keyword,
        imageUrl: buildFallbackImageUrl(keyword),
        readMoreUrl: entry["prism:url"] || undefined,
        readTime: readTimeFromText(desc),
      };
    });
}

// ─── Route ────────────────────────────────────────────────────────────────────

async function resolveSection(
  id: NewsSection["id"],
  label: string,
  subtitle: string,
  fetcher: () => Promise<NewsItem[]>,
  cacheQ: string,
  useCache: boolean,
): Promise<NewsItem[] | null> {
  if (useCache) {
    const cached = await getCached(id, cacheQ);
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.items;
  }
  try {
    const items = await fetcher();
    if (useCache) await setCached(id, items, cacheQ);
    console.log(`[${id}] Fetched ${items.length} articles${cacheQ ? ` (q: "${cacheQ}")` : ""}`);
    return items;
  } catch (err) {
    console.error(`[${id}] Failed:`, err);
    // Fall back to stale DB cache (survives restarts, prevents blank feed)
    return await getStale(id, cacheQ);
  }
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const now = Date.now();
  const sections: NewsSection[] = [];
  const customQ = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const useCache = !customQ;

  // 1. NewsAPI (primary) → IFT RSS (fallback if NewsAPI fails completely) ────
  const newsApiItems = await resolveSection(
    "newsapi", "Food Tech Newsfeed", "NewsAPI · Food Technology & Flavours",
    () => fetchFromNewsAPI(customQ || undefined), customQ, useCache,
  );
  if (newsApiItems && newsApiItems.length > 0) {
    sections.push({ id: "newsapi", label: "Food Tech Newsfeed", subtitle: "NewsAPI · Food Technology & Flavours", items: newsApiItems });
  } else {
    // IFT fallback — only when NewsAPI has nothing (not even stale)
    const iftItems = await resolveSection(
      "ift", "Food Science Today", "IFT.org · Institute of Food Technologists",
      () => fetchFromIFT(), "", useCache,
    );
    if (iftItems && iftItems.length > 0) {
      sections.push({ id: "ift", label: "Food Science Today", subtitle: "IFT.org · Institute of Food Technologists", items: iftItems });
    }
  }

  // 2. Guardian (editorial — only if key configured) ────────────────────────
  if (GUARDIAN_API_KEY) {
    const guardianItems = await resolveSection(
      "guardian", "Industry Spotlight", "The Guardian",
      () => fetchFromGuardian(customQ || undefined), customQ, useCache,
    );
    if (guardianItems && guardianItems.length > 0) {
      sections.push({ id: "guardian", label: "Industry Spotlight", subtitle: "The Guardian", items: guardianItems });
    }
  }

  // 3. GNews (flavour technology) ───────────────────────────────────────────
  const gnewsItems = await resolveSection(
    "gnews", "Flavour Technology", "GNews · Global Flavour & Food Innovation",
    () => fetchFromGNews(), "", true, // GNews doesn't support custom queries
  );
  if (gnewsItems && gnewsItems.length > 0) {
    sections.push({ id: "gnews", label: "Flavour Technology", subtitle: "GNews · Global Flavour & Food Innovation", items: gnewsItems });
  }

  // 4. Elsevier (research journals — only if key configured) ────────────────
  if (ELSEVIER_API_KEY) {
    const elsevierItems = await resolveSection(
      "elsevier", "Research & Science", "Elsevier ScienceDirect · Peer-reviewed journals",
      () => fetchFromElsevier(customQ || undefined), customQ, useCache,
    );
    if (elsevierItems && elsevierItems.length > 0) {
      sections.push({ id: "elsevier", label: "Research & Science", subtitle: "Elsevier ScienceDirect · Peer-reviewed journals", items: elsevierItems });
    }
  }

  res.json({ sections, fetchedAt: new Date(now).toISOString() });
});

export default router;
