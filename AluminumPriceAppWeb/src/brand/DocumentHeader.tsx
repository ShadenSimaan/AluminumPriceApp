import type { ReactNode } from "react";
import CompanyLogo from "./CompanyLogo";

/** Same branding block for every document screen: company logo, then the document title. */
export default function DocumentHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-start gap-2 min-w-0 basis-64 sm:flex-row sm:items-center sm:gap-3">
      <CompanyLogo size="document" />
      <div className="min-w-0 w-full sm:w-auto sm:flex-1">
        <h2 className="text-xl font-semibold break-words">{title}</h2>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
    </div>
  );
}
