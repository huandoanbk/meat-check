export type Product = {
  id: string;
  name: string;
  keywords: string[];
};

export const PRODUCTS: Product[] = [
  {
    id: "10550",
    name: "SIANPÄÄ 新鲜猪头",
    keywords: ["SIANPÄÄ"],
  },
  {
    id: "10567",
    name: "SIAN MAKSA 新鲜猪肝",
    keywords: ["MAKSA"],
  },
  {
    id: "10568",
    name: "PORSAAN SYDÄN 新鲜猪心",
    keywords: ["SYDÄN"],
  },
    {
    id: "10569",
    name: "SIAN KIELI 新鲜猪舌",
    keywords: ["KIELI"],
  },
    {
    id: "10570",
    name: "SORKKA 新鲜猪蹄",
    keywords: ["SORKKA"],
  },
    {
    id: "10572",
    name: "S-KYLKI LUUTON 新鲜五花肉",
    keywords: ["LUUTON"],
  },
    {
    id: "10574",
    name: "新鲜猪肘 SIAN ETUPOTKA",
    keywords: ["ETUPOTKA"],
  },
    {
    id: "10584",
    name: "新鲜筒骨LUUT II (Jalkalui LUUT",
    keywords: ["Jalkalui"],
  },
    {
    id: "10585",
    name: "Possaan kylkirusto",
    keywords: ["kylkirusto"],
  },
    {
    id: "10794",
    name: "Etupään Rusto /kg | 新鲜猪骨",
    keywords: ["Etupää"],
  },
    {
    id: "10795",
    name: "Porsaan Kolmioluu /kg | 猪肋排",
    keywords: ["Kolmioluu"],
  },
    {
    id: "10797",
    name: "S-Rankaluu  /kg | 猪脊骨",
    keywords: ["Rankaluu"],
  },

  // TODO: Add ~15 total products with 1–2 simple keywords each for OCR matching.
];
