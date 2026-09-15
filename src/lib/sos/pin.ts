/**
 * The "I am safe" PINs. Optional, per device, stored only as salted hashes.
 *
 *   safe PIN    ends the alert.
 *   duress PIN  looks exactly the same on screen, but the alert keeps running
 *               (recording, location, contacts are not told the user is safe) and
 *               responders see it was cancelled under duress.
 *
 * Kept on the device, not the server, so it works with no signal. A four-digit
 * hash is not a secret against someone with the phone and time; it is a
 * barrier against someone standing over the user.
 */

export type PinCheck = "safe" | "duress" | "wrong";

interface StoredPins {
  salt: string;
  safe: string;
  duress: string | null;
}

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const keyFor = (userId: string) => `haven-pins:${userId}`;

export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);

async function hash(pin: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function read(storage: KV, userId: string): StoredPins | null {
  try {
    const raw = storage.getItem(keyFor(userId));
    return raw ? (JSON.parse(raw) as StoredPins) : null;
  } catch {
    return null;
  }
}

export function hasPins(userId: string, storage: KV = localStorage) {
  const pins = read(storage, userId);
  return { safe: !!pins?.safe, duress: !!pins?.duress };
}

export async function savePins(
  userId: string,
  safePin: string,
  duressPin: string | null,
  storage: KV = localStorage,
): Promise<void> {
  if (!isValidPin(safePin)) throw new Error("The PIN must be 4 to 6 digits.");
  if (duressPin !== null && !isValidPin(duressPin)) throw new Error("The duress PIN must be 4 to 6 digits.");
  if (duressPin !== null && duressPin === safePin) throw new Error("The duress PIN must be different from your PIN.");
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const pins: StoredPins = {
    salt,
    safe: await hash(safePin, salt),
    duress: duressPin === null ? null : await hash(duressPin, salt),
  };
  storage.setItem(keyFor(userId), JSON.stringify(pins));
}

export function clearPins(userId: string, storage: KV = localStorage) {
  storage.removeItem(keyFor(userId));
}

export async function checkPin(userId: string, pin: string, storage: KV = localStorage): Promise<PinCheck> {
  const pins = read(storage, userId);
  if (!pins) return "safe";
  const h = await hash(pin, pins.salt);
  if (h === pins.safe) return "safe";
  if (pins.duress && h === pins.duress) return "duress";
  return "wrong";
}
