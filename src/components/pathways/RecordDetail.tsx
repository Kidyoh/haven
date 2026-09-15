import { lazy, Suspense, useState } from "react";
import { ArrowLeft, Briefcase, Clock, Coins, DoorOpen, ExternalLink, ListChecks, Map as MapIcon, MapPin, Phone, StickyNote } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { field, formatDate, t } from "@/lib/pathways/i18n";
import { NATIONWIDE, regionLabel } from "@/lib/pathways/regions";
import { hasCoordinates } from "@/lib/pathways/geo";

// Leaflet is only downloaded by someone who opens the map.
const Directions = lazy(() => import("./Directions"));
import type { Locale, ServiceRecord } from "@/lib/pathways/types";
import { Button } from "@/components/ui/button";

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_1fr] items-start gap-3 border-b border-border py-3">
      <span className="mt-0.5 text-haven-gold [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <div>
        <div className="text-[0.86em] text-muted-foreground">{label}</div>
        <div className="mt-0.5 [overflow-wrap:anywhere]">{children}</div>
      </div>
    </div>
  );
}

export function RecordDetail({
  record,
  locale,
  stalenessDays,
  today,
  onBack,
}: {
  record: ServiceRecord;
  locale: Locale;
  stalenessDays: number;
  today: Date;
  onBack: () => void;
}) {
  const notStated = <span className="text-muted-foreground">{t(locale, "record.not_stated")}</span>;
  const where = field(record, "location_description", locale);
  const bring = field(record, "what_to_bring", locale);
  const notes = field(record, "notes", locale);
  const [showMap, setShowMap] = useState(false);
  const pin = hasCoordinates(record.coordinates) ? record.coordinates : null;

  return (
    <article>
      <Button variant="ghost" onClick={onBack} className="mt-3 -ml-2">
        <ArrowLeft />
        {t(locale, "results.back")}
      </Button>

      <h1 className="mb-1 mt-4 text-[1.45em] font-bold leading-snug [overflow-wrap:anywhere]">
        {field(record, "name", locale)}
      </h1>
      <p className="mb-3 text-[0.9em] text-muted-foreground">
        {t(locale, `category.${record.category}`)}
        {record.subcity ? ` · ${record.subcity}` : ""} ·{" "}
        {record.region === NATIONWIDE ? t(locale, "region.nationwide") : regionLabel(locale, record.region)}
      </p>
      <StatusBadge record={record} locale={locale} stalenessDays={stalenessDays} today={today} detailed />

      {/* The phone number is the thing most people came for. It goes first,
          as a real action, not a line in a table. */}
      {record.phone.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {record.phone.map((p) => (
            <Button key={p} asChild variant="gold" size="lg">
              <a href={`tel:${p}`}>
                <Phone />
                {t(locale, "record.call", { number: p })}
              </a>
            </Button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col">
        <Row icon={<MapPin />} label={t(locale, "record.where")}>
          {where ?? notStated}
          {pin && !showMap && (
            <Button variant="subtle" className="mt-2" onClick={() => setShowMap(true)}>
              <MapIcon />
              {t(locale, "directions.open")}
            </Button>
          )}
          {pin && showMap && (
            <Suspense fallback={<p className="mt-2 text-muted-foreground">{t(locale, "directions.loading")}</p>}>
              <Directions destination={pin} name={field(record, "name", locale) ?? record.name_en} locale={locale} />
            </Suspense>
          )}
        </Row>

        <Row icon={<ListChecks />} label={t(locale, "record.what")}>
          <ul className="services list-disc pl-[18px]">
            {record.services.map((s) => (
              <li key={s}>{t(locale, `service.${s}`)}</li>
            ))}
          </ul>
        </Row>

        <Row icon={<Briefcase />} label={t(locale, "record.bring")}>
          {bring ?? notStated}
        </Row>

        <Row icon={<Clock />} label={t(locale, "record.hours")}>
          {record.hours ?? notStated}
        </Row>

        <Row icon={<Coins />} label={t(locale, "record.cost")}>
          {t(locale, `cost.${record.cost}`)}
        </Row>

        {record.accepts_walk_in !== null && (
          <Row icon={<DoorOpen />} label={t(locale, "record.walkin")}>
            {record.accepts_walk_in ? t(locale, "record.walkin_yes") : t(locale, "record.walkin_no")}
          </Row>
        )}

        {notes && (
          <div className="detail-text">
            <Row icon={<StickyNote />} label={t(locale, "record.notes")}>
              {notes}
            </Row>
          </div>
        )}
      </div>

      {/* Provenance. Source text is verbatim so a reader can audit the translation. */}
      <section className="mt-5 rounded-2xl bg-secondary px-4 py-3.5 text-[0.92em]" aria-label={t(locale, "record.source")}>
        <p>
          <strong className="font-semibold">{t(locale, "record.source")}:</strong> {record.source_name}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {t(locale, "status.checked", { date: formatDate(locale, record.verified_on) })} ·{" "}
          {t(locale, `verified_via.${record.verified_via}`)}
        </p>
        {record.source_url && (
          <a
            href={record.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 font-medium text-haven-gold hover:underline"
          >
            {t(locale, "record.open_source")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <div className="detail-text mt-3">
          <span className="text-muted-foreground">{t(locale, "record.source_text")}:</span>
          <blockquote
            lang={record.source_language ?? "en"}
            className="mt-2 whitespace-pre-wrap border-l-[3px] border-haven-gold/30 pl-3 text-muted-foreground"
          >
            {record.source_text_original}
          </blockquote>
        </div>
        {record.additional_sources && record.additional_sources.length > 0 && (
          <div className="detail-text mt-3">
            <span className="text-muted-foreground">{t(locale, "record.more_sources")}:</span>
            <ul className="mt-1 list-disc space-y-1 pl-[18px]">
              {record.additional_sources.map((s, i) => (
                <li key={i}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-haven-gold hover:underline">
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                  {s.note ? <span className="text-muted-foreground"> — {s.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </article>
  );
}
