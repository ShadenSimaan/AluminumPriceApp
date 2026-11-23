import type { ReactNode } from "react";
import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";
import type { Manufacturer, Profile } from "../types";
import { groupProfilesByManufacturer } from "./manufacturers";
import ManufacturerBadge from "./ManufacturerBadge";

/** Profile <SelectItem>s grouped under each company's logo. */
export function ProfileOptions({
  profiles,
  manufacturers,
  label = (p) => p.name,
}: {
  profiles: Profile[];
  manufacturers: Manufacturer[];
  label?: (profile: Profile) => ReactNode;
}) {
  const groups = groupProfilesByManufacturer(profiles, manufacturers);
  const grouped = groups.some((g) => g.manufacturer);
  return (
    <>
      {groups.map((group, i) => (
        <SelectGroup key={group.manufacturer?.id ?? "__none__"}>
          {i > 0 && <SelectSeparator />}
          {grouped && (
            <SelectLabel className="flex items-center gap-2 py-1.5 text-xs text-slate-500">
              {group.manufacturer ? <ManufacturerBadge manufacturer={group.manufacturer} className="h-4" showName /> : "ללא חברה"}
            </SelectLabel>
          )}
          {group.profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {label(p)}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}

/** Native company picker for profile forms. Empty value = no company. */
export function CompanySelect({
  value,
  manufacturers,
  onChange,
  className = "",
  showLogo = true,
}: {
  value: string | undefined;
  manufacturers: Manufacturer[];
  onChange: (id: string | undefined) => void;
  className?: string;
  /** The settings table already shows the logo on the group heading. */
  showLogo?: boolean;
}) {
  const selected = manufacturers.find((m) => m.id === value);
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <select
        className="min-w-0 w-full rounded-md bg-white border border-slate-300 px-2 py-1 text-sm"
        value={selected ? selected.id : ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">— ללא חברה —</option>
        {manufacturers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {showLogo && <ManufacturerBadge manufacturer={selected} className="h-6" />}
    </div>
  );
}
