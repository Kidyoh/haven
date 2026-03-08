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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const latestIncidentIdRef = useRef<string | null>(null);

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

  const startAudioRecording = useCallback(async (): Promise<void> => {
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
      recorder.start(1000);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }, []);

  const stopAudioRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        // Stop all tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  const uploadAudio = useCallback(async (blob: Blob): Promise<string | null> => {
    if (!userId) return null;
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
    return data.publicUrl;
  }, [userId]);

  const triggerSOS = useCallback(async (): Promise<SOSData | null> => {
    if (!userId) return null;
    setIsCapturing(true);

    try {
      // Start audio recording immediately (called from user gesture context)
      await startAudioRecording();

      // Auto-stop recording after 30 seconds and upload
      setTimeout(async () => {
        const audioBlob = await stopAudioRecording();
        if (audioBlob && audioBlob.size > 0) {
          const audioUrl = await uploadAudio(audioBlob);
          // We'll update the incident with audio URL once we have the incident ID
          // Store it for later use
          if (audioUrl && latestIncidentIdRef.current) {
            await supabase
              .from("incidents")
              .update({ audio_url: audioUrl })
              .eq("id", latestIncidentIdRef.current);
          }
        }
      }, 30000);

      // Get location in parallel
      const location = await getLocation();

      // Generate reference number
      const refNum = `HVN-${Date.now().toString(36).toUpperCase()}`;

      // Get battery level if available
      let batteryLevel: number | null = null;
      try {
        const battery = await (navigator as any).getBattery?.();
        if (battery) batteryLevel = Math.round(battery.level * 100);
      } catch {}

      // Create incident in DB
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

      // Store incident ID for the auto-stop audio upload
      latestIncidentIdRef.current = incident.id;

      // Also insert first location update
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
        audioUrl: null, // Will be set when recording stops
      };
    } catch (err) {
      console.error("SOS trigger failed:", err);
      setIsCapturing(false);
      return null;
    }
  }, [userId, startAudioRecording, getLocation]);

  const resolveIncident = useCallback(async (incidentId: string): Promise<void> => {
    // Stop audio recording and upload
    const audioBlob = await stopAudioRecording();
    let audioUrl: string | null = null;

    if (audioBlob && audioBlob.size > 0) {
      audioUrl = await uploadAudio(audioBlob);
    }

    // Update incident with audio URL and resolve
    await supabase
      .from("incidents")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        audio_url: audioUrl,
      })
      .eq("id", incidentId);

    setIsCapturing(false);
  }, [stopAudioRecording, uploadAudio]);

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

        // Also update incident's latest location
        await supabase
          .from("incidents")
          .update({ latitude: location.lat, longitude: location.lng, accuracy_meters: location.accuracy })
          .eq("id", incidentId);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return intervalId;
  }, [userId, getLocation]);

  return {
    triggerSOS,
    resolveIncident,
    startLocationTracking,
    isCapturing,
    isRecording: mediaRecorderRef.current?.state === "recording",
  };
};
