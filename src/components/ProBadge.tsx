import { getStoredColorTheme } from "@/hooks/useColorTheme";

const BADGE_STYLES = {
  sunrise: {
    background: "linear-gradient(135deg, hsl(43, 96%, 56%), hsl(53, 98%, 77%))",
    color: "hsl(217, 33%, 17%)",
  },
  stormy: {
    background: "linear-gradient(135deg, hsl(214, 18%, 46%), hsl(212, 22%, 80%))",
    color: "hsl(214, 38%, 15%)",
  },
};

const ProBadge = () => {
  const style = BADGE_STYLES[getStoredColorTheme()];
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded"
      style={style}
    >
      PRO
    </span>
  );
};

export default ProBadge;
