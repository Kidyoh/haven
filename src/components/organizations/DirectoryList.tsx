import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActivePill, QuickActions, TypeBadge } from "./Badges";
import type { Organization } from "@/lib/organizations/directory";

const place = (org: Organization) => [org.subcity, org.region].filter(Boolean).join(", ");

/** Cards on a phone, a table from md up. Selecting either opens the detail panel. */
export function DirectoryList({ orgs, onOpen }: { orgs: Organization[]; onOpen: (org: Organization) => void }) {
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
        {orgs.map((org) => (
          <li
            key={org.id}
            className={cn(
              "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4",
              !org.is_active && "opacity-70",
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(org)}
              className="flex min-h-11 items-start justify-between gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-semibold text-foreground">{org.name}</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{place(org) || "No location recorded"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <TypeBadge type={org.type} />
                  {!org.is_active && <ActivePill active={false} />}
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
            {org.services.length > 0 && (
              <p className="line-clamp-2 text-xs text-muted-foreground">{org.services.join(" · ")}</p>
            )}
            <QuickActions org={org} />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Services</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((org) => (
              <TableRow key={org.id} className="cursor-pointer" onClick={() => onOpen(org)}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(org);
                    }}
                    className="text-left text-foreground hover:text-haven-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {org.name}
                  </button>
                </TableCell>
                <TableCell>
                  <TypeBadge type={org.type} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{place(org) || "—"}</TableCell>
                <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground">
                  {org.services.join(", ") || "—"}
                </TableCell>
                <TableCell>
                  <ActivePill active={org.is_active} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(org.updated_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <QuickActions org={org} compact />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
