import type { Product } from "./products";

export function normalizeText(text: string): string {
  // Normalize: trim, uppercase, collapse spaces, strip accents so Ä/Å/Ö match A/O when OCR drops diacritics.
  return text
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

// Simple Levenshtein distance for short strings; products list is tiny so O(mn) is fine.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

export function matchProduct(
  ocrText: string,
  products: Product[]
): { product: Product | null; method: "keyword" | "fuzzy" | "none" } {
  const normalized = normalizeText(ocrText);

  // Step A: exact keyword contains match (fast/precise)
  for (const product of products) {
    const hasKeyword = product.keywords.some((keyword) =>
      normalized.includes(normalizeText(keyword))
    );

    if (hasKeyword) {
      return { product, method: "keyword" };
    }
  }

  // Step B: fuzzy match to handle small OCR typos (e.g., ETUPAARUST0 vs ETUPÄÄRUSTO)
  const tokens = normalized.split(" ").filter(Boolean);
  let bestProduct: Product | null = null;
  let bestScore = 0;
  const FUZZY_THRESHOLD = 0.75;

  for (const product of products) {
    for (const keyword of product.keywords) {
      const target = normalizeText(keyword);
      // compare against full text and each token; keep the best similarity
      const scores = [
        similarity(target, normalized),
        ...tokens.map((t) => similarity(target, t)),
      ];
      const score = Math.max(...scores);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    }
  }

  if (bestProduct && bestScore >= FUZZY_THRESHOLD) {
    return { product: bestProduct, method: "fuzzy" };
  }

  return { product: null, method: "none" };
}

// Usage example:
// import { PRODUCTS } from "./products";
// const result = matchProduct(ocrText, PRODUCTS);
// if (!result.product) {
//   // UI sẽ bắt user chọn product thủ công trong dropdown confirm
// }
