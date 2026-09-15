import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Compass, Cross, FileText, Home, MessageCircle, Phone, Scale, Search, X } from "lucide-react";
import { RecordDetail } from "@/components/pathways/RecordDetail";
import { StatusBadge } from "@/components/pathways/StatusBadge";
import { checkForUpdate, fetchDataset, loadCachedDataset, requestBackgroundSync, saveDataset } from "@/lib/pathways/dataset";
import { AVAILABLE_LOCALES, field, initialLocale, storeLocale, t, tn } from "@/lib/pathways/i18n";
import { NEEDS, matchesNeed, rankForNeed, type Need } from "@/lib/pathways/needs";
import { NATIONWIDE, matchesRegion, regionLabel, regionOptions } from "@/lib/pathways/regions";
import { searchRecords, type SearchableText } from "@/lib/pathways/search";
import { DEFAULT_STALENESS_DAYS } from "@/lib/pathways/staleness";
import type { Dataset, Locale, ServiceRecord } from "@/lib/pathways/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Container, IconTile, Screen } from "@/components/haven/Screen";
import { EmptyState, Spinner } from "@/components/haven/Feedback";
import "./pathways.css";

/**
 * HAVEN Pathways: an offline-first, verified directory of GBV and protection
 * services. One route; the views below are React state, not URLs, so nothing
 * about what was looked at enters the browser history. No auth, no analytics,
 * no query ever leaves the phone.
 *
 * It wears HAVEN's gold accent rather than the SOS red: this is the calm
 * informational layer, and nothing here is an emergency action.
 */

type View = { kind: "home" } | { kind: "results"; need: Need | null } | { kind: "record"; record: ServiceRecord } | { kind: "about" };

const SIMPLE_KEY = "pathways.simple";
const REGION_KEY = "pathways.region";
// Quick exit lands on a neutral, widely visited page.
const EXIT_URL = "https://www.google.com/";
// Neutral tab title while on this screen; nothing alarming at a glance.
const NEUTRAL_TITLE = "Pathways";

const NEED_ICONS: Record<Need["icon"], React.ReactNode> = {
  medical: <Cross />,
  home: <Home />,
  report: <FileText />,
  legal: <Scale />,
  talk: <MessageCircle />,
  phone: <Phone />,
};

export default function Pathways() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const [simple, setSimple] = useState(false);
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<View>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const today = useMemo(() => new Date(), []);

  const stalenessDays = dataset?.meta.staleness_days ?? DEFAULT_STALENESS_DAYS;

  /**
   * Apply an update check. Reaching the network at all is the honest signal
   * for the offline banner — navigator.onLine is optimistic on phones and
   * stays true behind a captive portal or a dead cell.
   */
  const applyCheck = useCallback((r: Awaited<ReturnType<typeof checkForUpdate>>) => {
    if (r.status === "updated") setDataset(r.dataset);
    setOnline(r.status !== "offline");
    return r;
  }, []);

  // ---- boot: cached dataset first, network only if there is none ----------
  const boot = useCallback(async () => {
    setLoadError(false);
    let ds = await loadCachedDataset();
    if (!ds) {
      try {
        ds = await fetchDataset();
        await saveDataset(ds);
      } catch {
        setLoadError(true);
        requestBackgroundSync();
        return;
      }
    }
    setDataset(ds);
    setLocale(initialLocale(ds.meta.default_language));
    // Quiet background check; the UI never blocks on it.
    checkForUpdate(ds).then(applyCheck);
  }, [applyCheck]);

  useEffect(() => {
    boot();
  }, [boot]);

  // ---- background sync result from the service worker ------------------------
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "pathways-dataset-refreshed") {
        loadCachedDataset().then((ds) => ds && setDataset(ds));
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  // ---- online / offline ---------------------------------------------------
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      checkForUpdate(null).then(applyCheck);
    };
    const down = () => {
      setOnline(false);
      requestBackgroundSync();
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [applyCheck]);

  // ---- preferences + neutral title ---------------------------------------------
  useEffect(() => {
    try {
      setSimple(localStorage.getItem(SIMPLE_KEY) === "1");
      setRegion(localStorage.getItem(REGION_KEY) || null);
    } catch {
      /* storage blocked: default view */
    }
    const previousTitle = document.title;
    document.title = NEUTRAL_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);

  // ---- quick exit -------------------------------------------------------------
  const quickExit = useCallback(() => {
    setView({ kind: "home" });
    setQuery("");
    document.title = " ";
    // replace(), not assign(): this page is replaced in history rather than
    // left as the previous entry.
    window.location.replace(EXIT_URL);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") quickExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickExit]);

  // ---- derived lists ---------------------------------------------------------
  const toText = useCallback(
    (r: ServiceRecord): SearchableText => ({
      names: [r.name_en, r.name_am, ...r.phone],
      place: [
        r.subcity ?? "",
        r.region,
        regionLabel(locale, r.region),
        r.location_description_en ?? "",
        r.location_description_am ?? "",
        ...r.services.map((s) => t(locale, `service.${s}`)),
        t(locale, `category.${r.category}`),
      ],
      other: [r.notes_en ?? "", r.notes_am ?? "", r.source_name],
    }),
    [locale],
  );

  const results = useMemo(() => {
    if (!dataset) return [];
    let list = dataset.records.filter((r) => matchesRegion(r, region));
    const need = view.kind === "results" ? view.need : null;
    if (need) list = list.filter((r) => matchesNeed(r, need)).sort((a, b) => rankForNeed(a, need) - rankForNeed(b, need));
    return searchRecords(query, list, toText);
  }, [dataset, view, query, toText, region]);

  const regions = useMemo(() => (dataset ? regionOptions(dataset.records) : []), [dataset]);

  // ---- actions ------------------------------------------------------------------
  const switchLocale = () => {
    const i = AVAILABLE_LOCALES.indexOf(locale);
    const next = AVAILABLE_LOCALES[(i + 1) % AVAILABLE_LOCALES.length];
    setLocale(next);
    storeLocale(next);
  };
  const chooseRegion = (next: string | null) => {
    setRegion(next);
    try {
      if (next) localStorage.setItem(REGION_KEY, next);
      else localStorage.removeItem(REGION_KEY);
    } catch {
      /* storage blocked: the choice just does not persist */
    }
  };
  const toggleSimple = () => {
    setSimple((s) => {
      try {
        localStorage.setItem(SIMPLE_KEY, s ? "0" : "1");
      } catch {
        /* storage blocked: the choice just does not persist */
      }
      return !s;
    });
  };
  const manualUpdate = async () => {
    setChecking(true);
    setUpdateMsg(t(locale, "data.checking"));
    const r = applyCheck(await checkForUpdate(dataset));
    if (r.status === "updated") setUpdateMsg(t(locale, "data.updated", { n: r.dataset.record_count }));
    else if (r.status === "same") setUpdateMsg(t(locale, "data.uptodate"));
    else setUpdateMsg(t(locale, "data.offline"));
    setChecking(false);
  };
  const goHome = () => setView({ kind: "home" });

  const L = locale;

  return (
    <Screen className={`pathways${simple ? " simple" : ""}`}>
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        {/* Leave is always on the first row, within thumb reach. The two
            preference toggles take a row of their own on a narrow phone and
            join the first row once there is space — never a ragged wrap. */}
        <Container width="content" className="flex min-h-[64px] flex-wrap items-center gap-x-1.5 gap-y-1 py-2">
          <Button variant="ghost" onClick={goHome} aria-label={t(L, "nav.home")} className="mr-auto gap-2.5 px-1.5 text-foreground">
            <IconTile tone="gold" size="sm">
              <Compass />
            </IconTile>
            <span className="font-display text-base font-bold">{t(L, "app.title")}</span>
          </Button>
          <Button variant="subtle" onClick={quickExit} aria-label={t(L, "exit.aria")} className="order-1 font-semibold sm:order-none">
            <X />
            {t(L, "exit.button")}
          </Button>
          <div className="order-2 flex w-full justify-end gap-1 sm:order-none sm:w-auto">
            <Button variant="ghost" onClick={toggleSimple} aria-label={t(L, "simple.aria")} aria-pressed={simple} className="px-3 text-xs">
              {simple ? t(L, "simple.off") : t(L, "simple.on")}
            </Button>
            <Button
              variant="ghost"
              onClick={switchLocale}
              aria-label={t(L, "lang.switch_aria")}
              lang={L === "en" ? "am" : "en"}
              className="px-3 text-xs"
            >
              {t(L, "lang.switch_to")}
            </Button>
          </div>
        </Container>
      </header>

      <Container width="content" className="flex flex-1 flex-col pb-8">
        {!online && (
          <p className="mt-3 rounded-2xl bg-secondary px-4 py-2.5 text-[0.95em] text-muted-foreground" role="status">
            {t(L, "offline.banner")}
          </p>
        )}

        <main className="flex-1">
          {!dataset && !loadError && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Spinner tone="gold" />
              <p className="text-muted-foreground">{t(L, "data.loading")}</p>
            </div>
          )}
          {!dataset && loadError && (
            <EmptyState
              icon={<Compass />}
              tone="gold"
              title={t(L, "data.failed")}
              action={
                <Button variant="gold" size="lg" onClick={boot}>
                  {t(L, "data.retry")}
                </Button>
              }
            />
          )}

          {dataset && view.kind === "home" && (
            <>
              <h1 className="mb-1 mt-5 text-[1.45em] font-bold leading-snug">{t(L, "home.heading")}</h1>
              <p className="text-[0.9em] text-muted-foreground">{t(L, "app.disclaimer")}</p>

              <ul className="needs mt-4 grid list-none grid-cols-2 gap-2.5 p-0 max-[360px]:grid-cols-1">
                {NEEDS.map((need) => (
                  <li key={need.id}>
                    <button
                      type="button"
                      className="need flex h-full min-h-[112px] w-full flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-haven-gold/50 [overflow-wrap:anywhere]"
                      onClick={() => {
                        setQuery("");
                        setView({ kind: "results", need });
                      }}
                    >
                      <span className="text-haven-gold [&>svg]:h-8 [&>svg]:w-8">{NEED_ICONS[need.icon]}</span>
                      <span>{t(L, `needs.${need.id}`)}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <h2 className="mb-2 mt-7 text-[1.15em] font-semibold">{t(L, "home.or_search")}</h2>
              <form
                className="flex gap-2"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  setView({ kind: "results", need: null });
                }}
              >
                <label className="sr-only" htmlFor="pathways-q">
                  {t(L, "search.label")}
                </label>
                <Input
                  id="pathways-q"
                  type="search"
                  autoComplete="off"
                  enterKeyHint="search"
                  className="flex-1 rounded-full"
                  placeholder={t(L, "search.placeholder")}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (e.target.value) setView({ kind: "results", need: null });
                  }}
                />
                <Button type="submit" variant="gold" className="rounded-full px-5">
                  {t(L, "search.label")}
                </Button>
              </form>

              <p className="mt-4">
                <Button variant="subtle" onClick={() => setView({ kind: "results", need: null })}>
                  {t(L, "results.all")}
                </Button>
              </p>
            </>
          )}

          {dataset && view.kind === "results" && (
            <>
              <Button variant="ghost" onClick={goHome} className="mt-3 -ml-2">
                <ArrowLeft />
                {t(L, "results.back")}
              </Button>
              <h1 className="mb-1 mt-4 text-[1.45em] font-bold leading-snug">
                {view.need ? t(L, `needs.${view.need.id}`) : t(L, "results.all")}
              </h1>

              <form className="mt-3 flex gap-2" role="search" onSubmit={(e) => e.preventDefault()}>
                <label className="sr-only" htmlFor="pathways-q2">
                  {t(L, "search.label")}
                </label>
                <Input
                  id="pathways-q2"
                  type="search"
                  autoComplete="off"
                  className="flex-1 rounded-full"
                  placeholder={t(L, "search.placeholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <Button type="button" variant="subtle" className="rounded-full" onClick={() => setQuery("")}>
                    {t(L, "search.clear")}
                  </Button>
                )}
              </form>

              {regions.length > 1 && (
                <div className="mt-3 flex items-center gap-2">
                  <label htmlFor="pathways-region" className="shrink-0 text-[0.9em] text-muted-foreground">
                    {t(L, "region.label")}
                  </label>
                  <select
                    id="pathways-region"
                    className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-[0.95em] text-foreground"
                    value={region ?? ""}
                    onChange={(e) => chooseRegion(e.target.value || null)}
                  >
                    <option value="">{t(L, "region.all")}</option>
                    {regions.map((name) => (
                      <option key={name} value={name}>
                        {regionLabel(L, name)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="mt-2 text-[0.9em] text-muted-foreground" aria-live="polite">
                {results.length === 0 ? "" : tn(L, "results.count", results.length)}
              </p>

              {results.length === 0 ? (
                <EmptyState icon={<Search />} tone="gold" title={t(L, "search.none")} />
              ) : (
                <ul className="mt-2 flex list-none flex-col gap-2.5 p-0">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-haven-gold/50 [overflow-wrap:anywhere]${
                          r.status === "reported_closed" ? " opacity-85" : ""
                        }`}
                        onClick={() => setView({ kind: "record", record: r })}
                      >
                        <span className="text-[1.05em] font-bold">{field(r, "name", L)}</span>
                        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[0.92em] text-muted-foreground">
                          <span>{t(L, `category.${r.category}`)}</span>
                          <span>
                            {r.region === NATIONWIDE
                              ? t(L, "region.nationwide")
                              : [r.subcity, regionLabel(L, r.region)].filter(Boolean).join(", ")}
                          </span>
                          {r.phone[0] && <span>{r.phone[0]}</span>}
                        </span>
                        <span className="text-[0.9em]">
                          {r.services.slice(0, 3).map((s) => t(L, `service.${s}`)).join(" · ")}
                        </span>
                        <StatusBadge record={r} locale={L} stalenessDays={stalenessDays} today={today} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {dataset && view.kind === "record" && (
            <RecordDetail
              record={view.record}
              locale={L}
              stalenessDays={stalenessDays}
              today={today}
              onBack={() => setView({ kind: "results", need: null })}
            />
          )}

          {dataset && view.kind === "about" && (
            <div className="space-y-2">
              <Button variant="ghost" onClick={goHome} className="mt-3 -ml-2">
                <ArrowLeft />
                {t(L, "results.back")}
              </Button>
              <h1 className="mb-1 mt-4 text-[1.45em] font-bold leading-snug">{t(L, "about.title")}</h1>
              <p>{t(L, "about.what")}</p>
              <p>{t(L, "about.not")}</p>
              <p>{t(L, "about.private")}</p>
              <p>{t(L, "about.trust")}</p>
              <p>{(dataset.meta[`coverage_note_${L}`] as string | undefined) ?? t(L, "about.coverage")}</p>
              <p>{t(L, "about.poc")}</p>
              <p>{t(L, "about.exit")}</p>
            </div>
          )}
        </main>

        {dataset && (
          <footer className="mt-8 flex flex-col gap-2 border-t border-border pt-4 text-[0.86em] text-muted-foreground">
            <div>
              {t(L, "data.version", { version: dataset.version, n: dataset.record_count, date: dataset.generated_at })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="subtle" size="sm" onClick={manualUpdate} disabled={checking}>
                {t(L, "data.check")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setView({ kind: "about" })}>
                {t(L, "nav.about")}
              </Button>
              {updateMsg && <span aria-live="polite">{updateMsg}</span>}
            </div>
          </footer>
        )}
      </Container>
    </Screen>
  );
}
