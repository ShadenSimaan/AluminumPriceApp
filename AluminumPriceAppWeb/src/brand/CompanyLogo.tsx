import { useState } from "react";
import { COMPANY_LOGO_ALT, COMPANY_LOGO_HEIGHT, COMPANY_LOGO_URL, COMPANY_LOGO_WIDTH } from "./logoAsset";

const HEIGHTS = {
  header: "h-11 sm:h-14",
  document: "h-14 sm:h-20",
} as const;

/** Company branding. Sits on its own white tile so the logo's white background never meets a tinted surface. */
export default function CompanyLogo({ size = "header", className = "" }: { size?: keyof typeof HEIGHTS; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`font-semibold text-slate-800 ${className}`}>אלום סמעאן סאמי</span>;
  }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-xl bg-white px-2 py-1 shadow-sm ring-1 ring-slate-200 ${className}`}>
      <img
        src={COMPANY_LOGO_URL}
        alt={COMPANY_LOGO_ALT}
        width={COMPANY_LOGO_WIDTH}
        height={COMPANY_LOGO_HEIGHT}
        className={`${HEIGHTS[size]} w-auto object-contain`}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
