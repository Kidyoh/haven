import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SOSData {
  incidentId: string;
  referenceNumber: string;
  latitude: number | null;
  longitude: number | null;
  audioUrl: string | null;
}

export const useSOSPipeline = (userId: string | undefined) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const latestIncidentIdRef = useRef<string | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStoppedRef = useRef(false);

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

  const stopAndUploadAudio = useCallback(async (incidentId: string | null): Promise<string | null> => {
    if (recordingStoppedRef.current) return null;
    recordingStoppedRef.current = true;
    setIsRecording(false);

    // Clear the auto-stop timer if it's still pending
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      // Clean up stream
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return null;
    }

    // Stop the recorder and wait for final data
    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        resolve(finalBlob.size > 0 ? finalBlob : null);
      };
      recorder.stop();
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
  }, [userId]);

  const triggerSOS = useCallback(async (): Promise<SOSData | null> => {
    if (!userId) return null;
    setIsCapturing(true);
    recordingStoppedRef.current = false;

    try {
      // Start audio recording immediately
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
        });
        streamRef.current = stream;
        chunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorderRef.current = recorder;
        recorder.start(1000); // Collect data every 1 second
        setIsRecording(true);
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

      // Auto-stop recording after exactly 30 seconds
      recordingTimerRef.current = setTimeout(() => {
        stopAndUploadAudio(incident.id);
      }, 30000);

      return {
        incidentId: incident.id,
        referenceNumber: incident.reference_number,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        audioUrl: null,
      };
    } catch (err) {
      console.error("SOS trigger failed:", err);
      setIsCapturing(false);
      return null;
    }
  }, [userId, getLocation, stopAndUploadAudio]);

  const resolveIncident = useCallback(async (incidentId: string): Promise<void> => {
    // Stop audio if still recording
    await stopAndUploadAudio(incidentId);

    // Resolve the incident
    await supabase
      .from("incidents")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", incidentId);

    latestIncidentIdRef.current = null;
    setIsCapturing(false);
  }, [stopAndUploadAudio]);

  // Continuous location tracking
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
