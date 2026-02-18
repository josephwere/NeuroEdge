import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, Text, View, Button } from "react-native";
import { NeuroEdgeTwinActionPump } from "@neuroedge/react-native-twin";

const ORCHESTRATOR_URL = "http://10.0.2.2:7070";

export default function App() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("idle");

  const pump = useMemo(
    () =>
      new NeuroEdgeTwinActionPump(
        {
          baseUrl: ORCHESTRATOR_URL,
          headers: {
            apiKey: "REPLACE_WITH_REAL_API_KEY",
            orgId: "personal",
            workspaceId: "default",
            userRole: "user",
            userEmail: "mobile@local",
            userName: "Mobile User"
          },
          device: {
            id: "mobile-dev-sample-1",
            platform: "android",
            deviceName: "NeuroEdge Sample Device",
            appVersion: "1.0.0",
            osVersion: "android-14",
            attestationProvider: "android_play_integrity",
            attestationStatus: "trusted"
          }
        },
        3000
      ),
    []
  );

  useEffect(() => {
    return () => {
      if (running) {
        pump.stop();
      }
    };
  }, [pump, running]);

  const start = async () => {
    try {
      setStatus("starting...");
      await pump.start();
      setRunning(true);
      setStatus("running");
    } catch (err: any) {
      setStatus(`failed: ${err?.message || String(err)}`);
    }
  };

  const stop = () => {
    pump.stop();
    setRunning(false);
    setStatus("stopped");
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: "#0f172a" }}>
      <View style={{ gap: 12 }}>
        <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>NeuroEdge Twin Sample</Text>
        <Text style={{ color: "#cbd5e1" }}>Mobile action pump status: {status}</Text>
        <Text style={{ color: "#94a3b8", fontSize: 12 }}>
          This sample registers device, polls pending actions, runs native handlers, and posts receipts.
        </Text>
        <Button title="Start Pump" onPress={start} disabled={running} />
        <Button title="Stop Pump" onPress={stop} disabled={!running} />
      </View>
    </SafeAreaView>
  );
}
