import React, { useEffect } from "react";
import { SafeAreaView, Text } from "react-native";
import { NeuroEdgeTwinActionPump } from "../src";

export default function App() {
  useEffect(() => {
    const pump = new NeuroEdgeTwinActionPump(
      {
        baseUrl: "http://localhost:7070",
        headers: {
          apiKey: "set_me",
          orgId: "personal",
          workspaceId: "default",
          userRole: "user",
          userEmail: "mobile@local",
          userName: "Mobile User"
        },
        device: {
          id: "mobile-dev-example-1",
          platform: "android",
          deviceName: "Example Device",
          appVersion: "1.0.0",
          osVersion: "android-14",
          attestationStatus: "trusted"
        }
      },
      3000
    );

    void pump.start();
    return () => pump.stop();
  }, []);

  return (
    <SafeAreaView>
      <Text>NeuroEdge Mobile Twin client running.</Text>
    </SafeAreaView>
  );
}
