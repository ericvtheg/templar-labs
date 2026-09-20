import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import HealthKit from "./healthkit";

const keys = {
  endpoint: "health-exporter.endpoint",
  secret: "health-exporter.secret",
  deviceId: "health-exporter.device-id",
} as const;

export default function App() {
  const [endpoint, setEndpoint] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("Configure the server, then sync recent steps.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const [storedEndpoint, storedSecret] = await Promise.all([
        SecureStore.getItemAsync(keys.endpoint),
        SecureStore.getItemAsync(keys.secret),
      ]);
      if (storedEndpoint !== null) {
        setEndpoint(storedEndpoint);
      }
      if (storedSecret !== null) {
        setSecret(storedSecret);
      }
    }
    void loadSettings().catch(() => setMessage("Unable to load saved settings. Enter them again."));
  }, []);

  async function sync() {
    setBusy(true);
    try {
      const baseUrl = endpoint.trim().replace(/\/$/, "");
      if (!baseUrl.startsWith("https://")) {
        throw new Error("The server URL must use HTTPS.");
      }
      if (secret.length < 32) {
        throw new Error("The personal secret must be at least 32 characters.");
      }
      await Promise.all([
        SecureStore.setItemAsync(keys.endpoint, baseUrl),
        SecureStore.setItemAsync(keys.secret, secret),
      ]);
      let deviceId = await SecureStore.getItemAsync(keys.deviceId);
      if (deviceId === null) {
        deviceId = Crypto.randomUUID();
        await SecureStore.setItemAsync(keys.deviceId, deviceId);
      }
      await HealthKit.requestPermissions();
      const samples = await HealthKit.readRecentSteps(7);
      if (samples.length === 0) {
        setMessage("HealthKit returned no step samples in the last 7 days. Nothing was sent.");
        return;
      }
      const response = await fetch(`${baseUrl}/api/v1/sample-ingestion`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ requestId: Crypto.randomUUID(), deviceId, samples }),
      });
      if (!response.ok) {
        throw new Error(`Sync failed with HTTP ${response.status}.`);
      }
      const result = (await response.json()) as { inserted: number; unchanged: number };
      setMessage(
        `Synced ${samples.length} real samples: ${result.inserted} new, ${result.unchanged} already stored.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    setBusy(true);
    try {
      const baseUrl = endpoint.trim().replace(/\/$/, "");
      if (!baseUrl.startsWith("https://")) {
        throw new Error("The server URL must use HTTPS.");
      }
      const response = await fetch(`${baseUrl}/api/v1/sample-ingestion`, {
        headers: { authorization: `Bearer ${secret}` },
      });
      if (!response.ok) {
        throw new Error(`Status failed with HTTP ${response.status}.`);
      }
      const status = (await response.json()) as {
        totalSamples: number;
        lastSync: { receivedAt: string } | null;
      };
      setMessage(
        status.lastSync === null
          ? "No uploads received yet."
          : `Server: ${status.totalSamples} stored samples. Last upload: ${status.lastSync.receivedAt}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.title}>Health Exporter</Text>
        <Text>
          Latest 100 step samples within 7 days only. Not a complete history or daily total.
        </Text>
        <Text style={styles.label}>HTTPS server URL</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setEndpoint}
          style={styles.input}
          value={endpoint}
        />
        <Text style={styles.label}>Personal bearer secret</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSecret}
          secureTextEntry
          style={styles.input}
          value={secret}
        />
        <Button
          disabled={busy}
          onPress={() => void sync()}
          title={busy ? "Syncing…" : "Sync latest 100 samples"}
        />
        <Button
          disabled={busy}
          onPress={() => void refreshStatus()}
          title="Refresh server status"
        />
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f6f8", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "white", borderRadius: 16, gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "600" },
  input: { borderColor: "#9ca3af", borderRadius: 8, borderWidth: 1, padding: 12 },
  message: { color: "#374151", marginTop: 8 },
});
