import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Texts a user's emergency contacts about one of their incidents.
 *
 *   POST { incident_id, kind: "alert" | "safe" }
 *
 * - "alert" goes to every contact, with the live tracking link and a map pin.
 * - "safe" goes only to contacts who actually received the alert.
 *
 * Safe to call repeatedly: each (incident, contact, kind) is claimed in
 * alert_notifications before sending, so a retry texts only the people a
 * previous attempt failed to reach.
 *
 * Secrets:
 *   SMS_PROVIDER            "twilio" | "africastalking" (unset = not configured)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (number, or an MG… messaging service SID)
 *   AT_USERNAME, AT_API_KEY, AT_SENDER_ID (optional)
 *   PUBLIC_APP_URL          origin used in the tracking link (falls back to the request Origin)
 *   DEFAULT_COUNTRY_CODE    for numbers saved without one (default 251)
 *   EMERGENCY_NUMBER        named in the alert text (default 991)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Alerts a single account may send per hour, so the SOS button cannot be used to spam contacts. */
const MAX_ALERT_INCIDENTS_PER_HOUR = 5;
/** A claim left in "sending" this long is assumed to belong to a crashed invocation. */
const STALE_SENDING_MS = 2 * 60 * 1000;

type Kind = "alert" | "safe";
type Outcome = "sent" | "partial" | "failed" | "not_configured" | "no_contacts" | "skipped" | "rate_limited";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const result = (status: Outcome, sent = 0, failed = 0, total = 0) => json({ status, sent, failed, total });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { incident_id, kind } = (await req.json().catch(() => ({}))) as { incident_id?: string; kind?: Kind };
    if (!incident_id || (kind !== "alert" && kind !== "safe")) {
      return json({ error: "incident_id and kind ('alert' | 'safe') are required" }, 400);
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: incident } = await admin
      .from("incidents")
      .select("id, user_id, status, reference_number, latitude, longitude")
      .eq("id", incident_id)
      .maybeSingle();
    if (!incident || incident.user_id !== caller.id) return json({ error: "Incident not found" }, 404);

    // The client queues "safe" behind the resolve, so a still-active incident
    // here means the resolve has not landed; an inactive one means the alert
    // is stale. Neither should text anyone.
    if (kind === "alert" && incident.status !== "active") return result("skipped");
    if (kind === "safe" && incident.status === "active") return result("skipped");

    let contacts = await loadContacts(admin, caller.id);
    if (kind === "safe") {
      const { data: alerted } = await admin
        .from("alert_notifications")
        .select("contact_id")
        .eq("incident_id", incident.id)
        .eq("kind", "alert")
        .eq("status", "sent");
      const reached = new Set((alerted ?? []).map((r) => r.contact_id));
      contacts = contacts.filter((c) => reached.has(c.id));
      if (contacts.length === 0) return result("skipped");
    }
    if (contacts.length === 0) return result("no_contacts");

    const provider = getProvider();
    if (!provider) return result("not_configured", 0, 0, contacts.length);

    if (kind === "alert" && (await isRateLimited(admin, caller.id, incident.id))) {
      return result("rate_limited", 0, 0, contacts.length);
    }

    const { data: profile } = await admin.from("profiles").select("full_name").eq("user_id", caller.id).maybeSingle();
    const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Someone";

    const message =
      kind === "alert"
        ? alertMessage({
            firstName,
            trackingUrl: await ensureTrackingUrl(admin, caller.id, req.headers.get("origin")),
            lat: incident.latitude,
            lng: incident.longitude,
          })
        : `HAVEN: ${firstName} marked their alert as safe (ref ${incident.reference_number}).`;

    const countryCode = Deno.env.get("DEFAULT_COUNTRY_CODE") ?? "251";
    let sent = 0;
    let failed = 0;

    await Promise.all(
      contacts.map(async (contact) => {
        const to = normalizePhone(contact.phone, countryCode);
        const claimId = await claim(admin, {
          incident_id: incident.id,
          user_id: caller.id,
          contact_id: contact.id,
          kind,
          to_phone: to,
          provider: provider.name,
        });
        // Already sent (or being sent right now by another attempt).
        if (!claimId) {
          sent++;
          return;
        }
        try {
          const messageId = await provider.send(to, message);
          await admin
            .from("alert_notifications")
            .update({ status: "sent", provider_message_id: messageId, error: null })
            .eq("id", claimId);
          sent++;
        } catch (err) {
          await admin
            .from("alert_notifications")
            .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
            .eq("id", claimId);
          failed++;
        }
      }),
    );

    const status: Outcome = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
    return result(status, sent, failed, contacts.length);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});

interface Contact {
  id: string;
  name: string;
  phone: string;
}

async function loadContacts(admin: SupabaseClient, userId: string): Promise<Contact[]> {
  const { data } = await admin
    .from("emergency_contacts")
    .select("id, name, phone")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []).filter((c: Contact) => c.phone?.trim());
}

/**
 * Take ownership of one (incident, contact, kind) slot. Returns the row id to
 * update after sending, or null when someone already sent (or is sending) it.
 */
async function claim(
  admin: SupabaseClient,
  row: { incident_id: string; user_id: string; contact_id: string; kind: Kind; to_phone: string; provider: string },
): Promise<string | null> {
  const { data: inserted } = await admin
    .from("alert_notifications")
    .upsert({ ...row, channel: "sms", status: "sending" }, { onConflict: "incident_id,contact_id,kind", ignoreDuplicates: true })
    .select("id");
  if (inserted && inserted.length > 0) return inserted[0].id;

  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();
  const { data: reclaimed } = await admin
    .from("alert_notifications")
    .update({ status: "sending", error: null, to_phone: row.to_phone, provider: row.provider })
    .eq("incident_id", row.incident_id)
    .eq("contact_id", row.contact_id)
    .eq("kind", row.kind)
    .or(`status.eq.failed,and(status.eq.sending,updated_at.lt.${staleBefore})`)
    .select("id");
  return reclaimed && reclaimed.length > 0 ? reclaimed[0].id : null;
}

async function isRateLimited(admin: SupabaseClient, userId: string, incidentId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("alert_notifications")
    .select("incident_id")
    .eq("user_id", userId)
    .eq("kind", "alert")
    .gte("created_at", since);
  const incidents = new Set((data ?? []).map((r) => r.incident_id));
  incidents.delete(incidentId); // retries of this incident never count against it
  return incidents.size >= MAX_ALERT_INCIDENTS_PER_HOUR;
}

async function ensureTrackingUrl(admin: SupabaseClient, userId: string, origin: string | null): Promise<string | null> {
  const base = (Deno.env.get("PUBLIC_APP_URL") ?? origin ?? "").replace(/\/+$/, "");
  if (!base) return null;

  const { data: existing } = await admin
    .from("incident_shares")
    .select("share_token")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  let token = existing?.[0]?.share_token as string | undefined;

  if (!token) {
    const { data: created } = await admin
      .from("incident_shares")
      .insert({ user_id: userId, label: "Next of Kin" })
      .select("share_token")
      .single();
    token = created?.share_token;
  }
  return token ? `${base}/track/${token}` : null;
}

function alertMessage({
  firstName,
  trackingUrl,
  lat,
  lng,
}: {
  firstName: string;
  trackingUrl: string | null;
  lat: number | null;
  lng: number | null;
}): string {
  const emergency = Deno.env.get("EMERGENCY_NUMBER") ?? "991";
  const parts = [`HAVEN SOS: ${firstName} needs help now.`];
  if (trackingUrl) parts.push(`Live location: ${trackingUrl}`);
  if (lat != null && lng != null) parts.push(`Map: https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`);
  parts.push(`If you cannot reach ${firstName}, call police on ${emergency}.`);
  return parts.join(" ");
}

export function normalizePhone(raw: string, countryCode: string): string {
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = `+${p.slice(2)}`;
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return `+${countryCode}${p.slice(1)}`;
  if (p.startsWith(countryCode)) return `+${p}`;
  return `+${countryCode}${p}`;
}

interface SmsProvider {
  name: string;
  /** Resolves to the provider's message id; throws when the message was not accepted. */
  send(to: string, body: string): Promise<string | null>;
}

function getProvider(): SmsProvider | null {
  const which = (Deno.env.get("SMS_PROVIDER") ?? "").toLowerCase();

  if (which === "twilio") {
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_FROM");
    if (!sid || !token || !from) return null;
    return {
      name: "twilio",
      async send(to, body) {
        const params = new URLSearchParams({ To: to, Body: body });
        params.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? `Twilio responded ${res.status}`);
        return data.sid ?? null;
      },
    };
  }

  if (which === "africastalking") {
    const username = Deno.env.get("AT_USERNAME");
    const apiKey = Deno.env.get("AT_API_KEY");
    const senderId = Deno.env.get("AT_SENDER_ID");
    if (!username || !apiKey) return null;
    const base = username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
    return {
      name: "africastalking",
      async send(to, body) {
        const params = new URLSearchParams({ username, to, message: body });
        if (senderId) params.set("from", senderId);
        const res = await fetch(`${base}/version1/messaging`, {
          method: "POST",
          headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });
        const data = await res.json().catch(() => ({}));
        const recipient = data?.SMSMessageData?.Recipients?.[0];
        if (!res.ok || recipient?.status !== "Success") {
          throw new Error(recipient?.status ?? data?.SMSMessageData?.Message ?? `Africa's Talking responded ${res.status}`);
        }
        return recipient.messageId ?? null;
      },
    };
  }

  return null;
}
