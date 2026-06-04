// Maps World Cup team names to emoji flags.
const FLAGS: Record<string, string> = {
  Argentina: "🇦🇷", Australia: "🇦🇺", Austria: "🇦🇹",
  Belgium: "🇧🇪", Brazil: "🇧🇷", Cameroon: "🇨🇲",
  Canada: "🇨🇦", Chile: "🇨🇱", Colombia: "🇨🇴",
  Croatia: "🇭🇷", Denmark: "🇩🇰", Ecuador: "🇪🇨",
  Egypt: "🇪🇬", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", France: "🇫🇷",
  Germany: "🇩🇪", Ghana: "🇬🇭", Iran: "🇮🇷",
  Italy: "🇮🇹", Japan: "🇯🇵", "South Korea": "🇰🇷",
  Mexico: "🇲🇽", Morocco: "🇲🇦", Netherlands: "🇳🇱",
  Nigeria: "🇳🇬", Norway: "🇳🇴", Peru: "🇵🇪",
  Poland: "🇵🇱", Portugal: "🇵🇹", Qatar: "🇶🇦",
  "Saudi Arabia": "🇸🇦", Senegal: "🇸🇳", Serbia: "🇷🇸",
  Spain: "🇪🇸", Sweden: "🇸🇪", Switzerland: "🇨🇭",
  Tunisia: "🇹🇳", Turkey: "🇹🇷", Ukraine: "🇺🇦",
  Uruguay: "🇺🇾", USA: "🇺🇸", "United States": "🇺🇸",
  Wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
};

export function teamFlag(name: string): string {
  return FLAGS[name] ?? "🏳️";
}
