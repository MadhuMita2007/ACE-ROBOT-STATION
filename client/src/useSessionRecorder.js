
import { useCallback, useEffect, useRef, useState } from "react";

const DB_NAME = "RobotGroundStationDB";
const STORE_NAME = "sessions";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function useSessionRecorder() {
  const [recording, setRecording] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [replayData, setReplayData] = useState([]);
  const [replayIndex, setReplayIndex] = useState(0);

  const recordingRef = useRef(false);
  const samplesRef = useRef([]);
  const startTimeRef = useRef(0);

  const refreshSessions = useCallback(async () => {
    const db = await openDatabase();

    const items = await new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    setSessions(items.sort((a, b) => b.id - a.id));
  }, []);

  useEffect(() => {
    refreshSessions().catch(console.error);
  }, [refreshSessions]);

  const startRecording = useCallback(() => {
    samplesRef.current = [];
    startTimeRef.current = performance.now();
    recordingRef.current = true;
    setRecording(true);
  }, []);

  const recordSample = useCallback((telemetry) => {
    if (!recordingRef.current) return;

    samplesRef.current.push({
      ...telemetry,
      recordedAt: performance.now() - startTimeRef.current,
    });
  }, []);

  const stopRecording = useCallback(async () => {
    recordingRef.current = false;
    setRecording(false);

    const samples = samplesRef.current;
    if (samples.length === 0) return;

    const db = await openDatabase();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).add({
        name: `Robot Session ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        sampleCount: samples.length,
        durationMs: samples[samples.length - 1].recordedAt,
        samples,
      });

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    db.close();
    samplesRef.current = [];
    await refreshSessions();
  }, [refreshSessions]);

  const loadSession = useCallback(async (id) => {
    const db = await openDatabase();

    const session = await new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (session) {
      setReplayData(session.samples);
      setReplayIndex(0);
    }
  }, []);

  const deleteSession = useCallback(async (id) => {
    const db = await openDatabase();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });

    db.close();
    await refreshSessions();
  }, [refreshSessions]);

  return {
    recording,
    sessions,
    replayData,
    replayIndex,
    setReplayIndex,
    startRecording,
    recordSample,
    stopRecording,
    loadSession,
    deleteSession,
  };
}
