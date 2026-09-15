import type { SOSSnapshot } from "./engine";

/**
 * The headline on the active-alert screen. A pure function of the snapshot so
 * it is easy to test and to keep honest: it only claims what has happened, and
 * marks the alert urgent whenever the user should call or text for help
 * themselves.
 */
export function describeAlert(sos: SOSSnapshot): { title: string; detail: string; urgent: boolean } {
  if (!sos.delivered) {
    if (!sos.online) {
      return {
        title: "Waiting for signal",
        detail:
          "Your alert is saved on this phone and sends by itself the moment you are back online. If you can, call or text for help now.",
        urgent: true,
      };
    }
    return { title: "Sending your alert…", detail: "Connecting to HAVEN.", urgent: false };
  }

  const { state, sent, total } = sos.notify;
  switch (state) {
    case "sent":
      return {
        title: sent === 1 ? "Your contact has been texted" : `${sent} contacts have been texted`,
        detail: "They have a link to your live location. Keep this screen open if you can.",
        urgent: false,
      };
    case "partial":
      return {
        title: `Texted ${sent} of ${total} contacts`,
        detail: "Still trying the others. Responders on the HAVEN dashboard can see your alert.",
        urgent: false,
      };
    case "waiting":
    case "sending":
    case "idle":
      return {
        title: "Alert sent. Texting your contacts…",
        detail: "Responders on the HAVEN dashboard can already see it.",
        urgent: false,
      };
    case "retrying":
    case "failed":
      return {
        title: "Your contacts have not been reached yet",
        detail: "HAVEN keeps trying. Responders on the dashboard can see your alert. Call or text someone yourself if you can.",
        urgent: true,
      };
    case "not_configured":
      return {
        title: "Responders can see your alert",
        detail: "Text messages are not set up on this HAVEN server, so your contacts were not texted. Text them yourself below.",
        urgent: true,
      };
    case "no_contacts":
      return {
        title: "Responders can see your alert",
        detail: "You have no emergency contacts saved, so nobody was texted. Call for help below.",
        urgent: true,
      };
    case "rate_limited":
      return {
        title: "Responders can see your alert",
        detail: "Several alerts were sent in the last hour, so contacts were not texted again. Text them yourself below.",
        urgent: true,
      };
    case "skipped":
      return { title: "Responders can see your alert", detail: "Keep this screen open if you can.", urgent: false };
  }
}
