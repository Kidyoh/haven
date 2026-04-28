import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SOSData {
  incidentId: string;
  referenceNumber: string;
  latitude: number | null;
  longitude: number | null;
  audioUrl: string | null;
}

const RECORDING_DURATION_MS = 30000;

export const useSOSPipeline = (userId: string | undefined) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const latestIncidentIdRef = useRef<string | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const triggerInFlightRef = useRef(false);
  const recordingSessionRef = useRef<string | null>(null);

  const getLocation = useCallback((): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, []);

  const killStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => {
      t.stop();
      t.enabled = false;
    });
    streamRef.current = null;
  }, []);

  const stopAndUploadAudio = useCallback(async (incidentId: string | null): Promise<string | null> => {
    // Prevent double-stop
    if (stoppedRef.current) return null;
    stoppedRef.current = true;
    setIsRecording(false);

    // Clear the auto-stop timer
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    const sessionId = recordingSessionRef.current;
    mediaRecorderRef.current = null;

    if (!recorder || recorder.state === "inactive") {
      recordingSessionRef.current = null;
      killStream();
      return null;
    }

    // Force stop and collect final data
    const blob = await new Promise<Blob | null>((resolve) => {
      const timeout = setTimeout(() => {
        // Safety net: if onstop never fires, force cleanup
        killStream();
        const fallback = chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: recorder.mimeType })
          : null;
        chunksRef.current = [];
        recordingSessionRef.current = null;
        resolve(fallback);
      }, 3000);

      recorder.onstop = () => {
        clearTimeout(timeout);
        const finalBlob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        recordingSessionRef.current = null;
        killStream();
        resolve(finalBlob.size > 0 ? finalBlob : null);
      };

      try {
        recorder.requestData();
        recorder.stop();
      } catch {
        clearTimeout(timeout);
        killStream();
        chunksRef.current = [];
        recordingSessionRef.current = null;
        resolve(null);
      }
    });

    if (!blob || !userId) return null;

    // Upload
    const ext = blob.type.includes("webm") ? "webm" : "mp4";
    const fileName = `${userId}/sos_${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("evidence").upload(fileName, blob, {
      contentType: blob.type,
      cacheControl: "3600",
    });

    if (error) {
      console.error("Audio upload failed:", error);
      return null;
    }

    const { data } = supabase.storage.from("evidence").getPublicUrl(fileName);
    const audioUrl = data.publicUrl;

    // Update incident with audio URL
    const targetId = incidentId || latestIncidentIdRef.current;
    if (audioUrl && targetId) {
      await supabase
        .from("incidents")
        .update({ audio_url: audioUrl })
        .eq("id", targetId);
    }

    return audioUrl;
  }, [userId, killStream]);

  const triggerSOS = useCallback(async (): Promise<SOSData | null> => {
    if (!userId) return null;
    // Guard before any async work so double countdown completion cannot start duplicate recorders.
    if (triggerInFlightRef.current || mediaRecorderRef.current || streamRef.current) {
      console.warn("SOS already in progress, ignoring duplicate trigger");
      return null;
    }
    triggerInFlightRef.current = true;
    setIsCapturing(true);
    stoppedRef.current = false;

    try {
      // Start audio recording immediately
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
        });
        streamRef.current = stream;
        chunksRef.current = [];
        const sessionId = crypto.randomUUID();
        recordingSessionRef.current = sessionId;

        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (e) => {
          if (recordingSessionRef.current === sessionId && e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorderRef.current = recorder;
        recorder.start(1000);
        setIsRecording(true);

        // Hard stop at exactly 30 seconds - uses the stream tracks directly as backup
        recordingTimerRef.current = setTimeout(() => {
          console.log("30s recording limit reached, force stopping");
          // Immediately disable mic tracks to guarantee no more audio
          stream.getTracks().forEach((t) => { t.enabled = false; });
          stopAndUploadAudio(latestIncidentIdRef.current);
        }, RECORDING_DURATION_MS);
      } catch (err) {
        console.error("Mic access denied:", err);
      }

      // Get location in parallel
      const location = await getLocation();

      // Generate reference number
      const refNum = `HVN-${Date.now().toString(36).toUpperCase()}`;

      // Get battery level
      let batteryLevel: number | null = null;
      try {
        const battery = await (navigator as any).getBattery?.();
        if (battery) batteryLevel = Math.round(battery.level * 100);
      } catch {}

      // Create incident
      const { data: incident, error } = await supabase
        .from("incidents")
        .insert({
          user_id: userId,
          reference_number: refNum,
          latitude: location?.lat ?? null,
          longitude: location?.lng ?? null,
          accuracy_meters: location?.accuracy ?? null,
          battery_level: batteryLevel,
          signal_strength: navigator.onLine ? "online" : "offline",
          status: "active",
        })
        .select("id, reference_number")
        .single();

      if (error || !incident) {
        console.error("Failed to create incident:", error);
        setIsCapturing(false);
        return null;
      }

      latestIncidentIdRef.current = incident.id;
      triggerInFlightRef.current = false;

      // Insert first location update
      if (location) {
        await supabase.from("location_updates").insert({
          incident_id: incident.id,
          user_id: userId,
          latitude: location.lat,
          longitude: location.lng,
          accuracy_meters: location.accuracy,
        });
      }

      return {
        incidentId: incident.id,
        referenceNumber: incident.reference_number,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        audioUrl: null,
      };
    } catch (err) {
      console.error("SOS trigger failed:", err);
      triggerInFlightRef.current = false;
      setIsCapturing(false);
      return null;
    }
  }, [userId, getLocation, stopAndUploadAudio]);

  const resolveIncident = useCallback(async (incidentId: string): Promise<void> => {
    await stopAndUploadAudio(incidentId);

    await supabase
      .from("incidents")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", incidentId);

    latestIncidentIdRef.current = null;
    setIsCapturing(false);
  }, [stopAndUploadAudio]);

  const startLocationTracking = useCallback((incidentId: string) => {
    if (!userId) return null;

    const intervalId = setInterval(async () => {
      const location = await getLocation();
      if (location) {
        await supabase.from("location_updates").insert({
          incident_id: incidentId,
          user_id: userId,
          latitude: location.lat,
          longitude: location.lng,
          accuracy_meters: location.accuracy,
        });

        await supabase
          .from("incidents")
          .update({ latitude: location.lat, longitude: location.lng, accuracy_meters: location.accuracy })
          .eq("id", incidentId);
      }
    }, 5 * 60 * 1000);

    return intervalId;
  }, [userId, getLocation]);

  return {
    triggerSOS,
    resolveIncident,
    startLocationTracking,
    isCapturing,
    isRecording,
  };
};
