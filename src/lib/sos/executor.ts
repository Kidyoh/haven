import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ExecResult, Executor, OutboxOp } from "./outbox";

/**
 * Turns outbox ops into Supabase calls. Every op is idempotent so the outbox
 * can retry freely:
 *  - creates use the client-generated id and ignore duplicates;
 *  - status changes only apply from the state they expect;
 *  - storage uploads treat "already exists" as success and never overwrite.
 */

export interface NotifyResult {
  status: "sent" | "partial" | "failed" | "not_configured" | "no_contacts" | "skipped" | "rate_limited";
  sent: number;
  failed: number;
  total: number;
}

export function evidencePath(userId: string, incidentId: string, seq: number, mimeType: string) {
  const ext = mimeType.includes("mp4") || mimeType.includes("aac") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
  return `${userId}/${incidentId}/${String(seq).padStart(4, "0")}.${ext}`;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function createSupabaseExecutor(client: SupabaseClient<Database>): Executor {
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  /**
   * A conditional update that matched no row is only fine if the incident is
   * already where the update would have put it (a retry after a lost reply,
   * or a responder got there first). If the row is missing, or in some other
   * state, the op is not done: throwing keeps it queued.
   */
  const settle = async (incidentId: string, matched: { id: string }[] | null, acceptable: string[]) => {
    if (matched && matched.length > 0) return;
    const { data, error } = await client.from("incidents").select("status").eq("id", incidentId).maybeSingle();
    check(error);
    if (!data) throw new Error("incident not on the server yet");
    if (!acceptable.includes(data.status)) throw new Error(`incident is ${data.status}`);
  };

  return async (op: OutboxOp): Promise<ExecResult> => {
    switch (op.kind) {
      case "incident.create": {
        const { error } = await client
          .from("incidents")
          .upsert({ ...op.row, status: "pending" }, { onConflict: "id", ignoreDuplicates: true });
        check(error);
        return { done: true };
      }

      case "incident.activate": {
        const { data, error } = await client
          .from("incidents")
          .update({ status: "active", activated_at: iso(op.at), battery_level: op.batteryLevel })
          .eq("id", op.incidentId)
          .eq("status", "pending")
          .select("id");
        check(error);
        await settle(op.incidentId, data, ["active", "resolved"]);
        return { done: true };
      }

      case "incident.cancel": {
        const { data, error } = await client
          .from("incidents")
          .update({ status: "cancelled", resolved_at: iso(op.at) })
          .eq("id", op.incidentId)
          .eq("status", "pending")
          .select("id");
        check(error);
        await settle(op.incidentId, data, ["cancelled", "active", "resolved"]);
        return { done: true };
      }

      case "incident.resolve": {
        const { data, error } = await client
          .from("incidents")
          .update({ status: "resolved", resolved_at: iso(op.at) })
          .eq("id", op.incidentId)
          .in("status", ["pending", "active"])
          .select("id");
        check(error);
        await settle(op.incidentId, data, ["resolved", "cancelled"]);
        return { done: true };
      }

      case "incident.duress": {
        const { error } = await client
          .from("incidents")
          .update({ duress_at: iso(op.at) })
          .eq("id", op.incidentId)
          .is("duress_at", null);
        check(error);
        return { done: true };
      }

      case "location": {
        const { fix } = op;
        const { error } = await client.from("location_updates").upsert(
          {
            id: op.id,
            incident_id: op.incidentId,
            user_id: op.userId,
            latitude: fix.lat,
            longitude: fix.lng,
            accuracy_meters: fix.accuracy,
            recorded_at: iso(fix.at),
          },
          { onConflict: "id", ignoreDuplicates: true },
        );
        check(error);
        // Only move the incident's pin forward in time.
        const { error: pinError } = await client
          .from("incidents")
          .update({
            latitude: fix.lat,
            longitude: fix.lng,
            accuracy_meters: fix.accuracy,
            last_location_at: iso(fix.at),
          })
          .eq("id", op.incidentId)
          .or(`last_location_at.is.null,last_location_at.lt.${iso(fix.at)}`);
        check(pinError);
        return { done: true };
      }

      case "evidence": {
        const path = evidencePath(op.userId, op.incidentId, op.seq, op.mimeType);
        const { error: uploadError } = await client.storage.from("evidence").upload(path, op.blob, {
          contentType: op.mimeType || "application/octet-stream",
          upsert: false,
        });
        if (uploadError && !/exist|duplicate/i.test(uploadError.message)) throw new Error(uploadError.message);

        const { error } = await client.from("incident_evidence").upsert(
          {
            incident_id: op.incidentId,
            user_id: op.userId,
            seq: op.seq,
            storage_path: path,
            mime_type: op.mimeType || null,
            started_at: iso(op.startedAt),
            duration_ms: Math.round(op.durationMs),
            size_bytes: op.blob.size,
          },
          { onConflict: "incident_id,seq", ignoreDuplicates: true },
        );
        check(error);
        return { done: true };
      }

      case "notify": {
        const { data, error } = await client.functions.invoke<NotifyResult>("send-alert", {
          body: { incident_id: op.incidentId, kind: op.notify },
        });
        if (error) throw error;
        // Retry the contacts that failed; everything else is final.
        const retry = data?.status === "failed" || data?.status === "partial";
        return { done: !retry, data };
      }
    }
  };
}
