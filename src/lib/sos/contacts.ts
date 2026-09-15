/**
 * Emergency contacts cached on the phone, so the "text them yourself" fallback
 * works with no signal and without waiting for the server.
 */

export interface CachedContact {
  name: string;
  phone: string;
}

type KV = Pick<Storage, "getItem" | "setItem">;

const keyFor = (userId: string) => `haven-contacts:${userId}`;

export function cacheContacts(userId: string, contacts: CachedContact[], storage: KV = localStorage) {
  try {
    storage.setItem(keyFor(userId), JSON.stringify(contacts.map(({ name, phone }) => ({ name, phone }))));
  } catch {
    /* storage blocked: the fallback just has nobody to prefill */
  }
}

export function cachedContacts(userId: string | undefined, storage: KV = localStorage): CachedContact[] {
  if (!userId) return [];
  try {
    const raw = storage.getItem(keyFor(userId));
    return raw ? (JSON.parse(raw) as CachedContact[]) : [];
  } catch {
    return [];
  }
}

/**
 * An sms: link that opens the messaging app with recipients and text filled in.
 * iOS wants `&body=`, everyone else `?body=`.
 */
export function smsHref(phones: string[], body: string, userAgent = navigator.userAgent): string {
  const recipients = phones.map((p) => p.replace(/[^\d+]/g, "")).filter(Boolean).join(",");
  const separator = /iPad|iPhone|iPod/.test(userAgent) ? "&" : "?";
  return `sms:${recipients}${separator}body=${encodeURIComponent(body)}`;
}

export function fallbackMessage(firstName: string | null, lat: number | null, lng: number | null): string {
  const who = firstName ? `This is ${firstName}.` : "";
  const where = lat != null && lng != null ? ` My location: https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}` : "";
  return `SOS. ${who} I need help now.${where}`.replace(/\s+/g, " ").trim();
}
