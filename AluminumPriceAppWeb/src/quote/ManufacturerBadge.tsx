import { useState } from "react";
import type { Manufacturer } from "../types";

/** Company logo, or its name when there is no usable logo. */
export default function ManufacturerBadge({
  manufacturer,
  className = "h-5",
  showName = false,
}: {
  manufacturer: Manufacturer | undefined;
  className?: string;
  showName?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (!manufacturer) return null;
  const logo = manufacturer.logoUrl && !broken;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle shrink-0" title={manufacturer.name}>
      {logo ? (
        <img
          src={manufacturer.logoUrl}
          alt={manufacturer.name}
          className={`${className} w-auto max-w-[110px] object-contain`}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-xs font-semibold text-slate-700 rounded border border-slate-300 bg-white px-1.5 py-0.5">
          {manufacturer.name}
        </span>
      )}
      {showName && logo && <span className="text-xs text-slate-600">{manufacturer.name}</span>}
    </span>
  );
}
