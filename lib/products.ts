export type Product = {
  id: string;
  name: string;
  keywords: string[];
};

export const PRODUCTS: Product[] = [
  {
    id: "10550",
    name: "SIANPÄÄ",
    keywords: ["SIANPÄÄ"],
  },
  {
    id: "10567",
    name: "SIAN MAKSA",
    keywords: ["MAKSA"],
  },
  {
    id: "10568",
    name: "PORSAAN SYDÄN",
    keywords: ["SYDÄN"],
  },
    {
    id: "10569",
    name: "SIAN KIELI",
    keywords: ["KIELI"],
  },
    {
    id: "10570",
    name: "SORKKA",
    keywords: ["SORKKA"],
  },
    {
    id: "10572",
    name: "S-KYLKI LUUTON",
    keywords: ["LUUTON"],
  },
    {
    id: "10574",
    name: "SIAN ETUPOTKA",
    keywords: ["ETUPOTKA"],
  },
    {
    id: "10584",
    name: "LUUT II (Jalkalui LUUT)",
    keywords: ["Jalkalui"],
  },
    {
    id: "10585",
    name: "Possaan kylkirusto",
    keywords: ["kylkirusto"],
  },
    {
    id: "10794",
    name: "Etupään Rusto",
    keywords: ["Etupää"],
  },
    {
    id: "10795",
    name: "Porsaan Kolmioluu",
    keywords: ["Kolmioluu"],
  },
    {
    id: "10797",
    name: "S-Rankaluu",
    keywords: ["Rankaluu"],
  },
    {
    id: "10793",
    name: "Ulkofile",
    keywords: ["Ulkofile"],
  },
  {
    id: "10796",
    name: "Porsaan kyljysrivi",
    keywords: ["kyljysrivi"],
  },
  {
    id: "10792",
    name: "Sian munuainen",
    keywords: ["munuainen"],
  },
  {
    id: "10798",
    name: "Silava",
    keywords: ["Silava"],
  },
  // TODO: Add ~15 total products with 1–2 simple keywords each for OCR matching.
];
