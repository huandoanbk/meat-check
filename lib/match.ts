import type { Product } from "./products";

export function normalizeText(text: string): string {
  return text.trim().toUpperCase().replace(/\s+/g, " ");
}

export function matchProduct(
  ocrText: string,
  products: Product[]
): { product: Product | null; method: "keyword" | "none" } {
  const normalized = normalizeText(ocrText);

  for (const product of products) {
    const hasKeyword = product.keywords.some((keyword) =>
      normalized.includes(normalizeText(keyword))
    );

    if (hasKeyword) {
      return { product, method: "keyword" };
    }
  }

  return { product: null, method: "none" };
}

// Usage example:
// import { PRODUCTS } from "./products";
// const result = matchProduct(ocrText, PRODUCTS);
// if (!result.product) {
//   // UI sẽ bắt user chọn product thủ công trong dropdown confirm
// }
