export type Product = {
  id: string;
  name: string;
  keywords: string[];
};

export const PRODUCTS: Product[] = [
  {
    id: "sian_etupaarusto",
    name: "SIAN ETUPÄÄRUSTO",
    keywords: ["ETUPÄÄRUSTO"],
  },
  {
    id: "sian_kassler",
    name: "SIAN KASSLER",
    keywords: ["KASSLER"],
  },
  {
    id: "sian_niskapala",
    name: "SIAN NISKAPALA",
    keywords: ["NISKAPALA"],
  },
  // TODO: Add ~15 total products with 1–2 simple keywords each for OCR matching.
];
