export const siteConfig = {
  name: "Glass Chess",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://glass-chess.vercel.app",
  description:
    "A browser-only chess analysis workspace with local Stockfish evaluation, PGN import, FEN import, and engine-assisted move review."
};

export const navItems = [
  { href: "/", label: "Home" },
  { href: "/analysis/", label: "Analysis" },
  { href: "/privacy/", label: "Privacy" },
  { href: "/terms/", label: "Terms" },
  { href: "/licenses/", label: "Licenses" }
];
