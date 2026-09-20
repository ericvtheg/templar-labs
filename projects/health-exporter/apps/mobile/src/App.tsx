import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import HealthKit, { type AutomaticStatus } from "./healthkit";
import { archiveStatus, exportHealth, validateDestination } from "./sync";

const keys = {
  endpoint: "health-exporter.endpoint",
  secret: "health-exporter.secret",
  deviceId: "health-exporter.device-id",
} as const;

export default function App() {
  const [endpoint, setEndpoint] = useState("https://health-export.ericventor.com");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState(
    "Connect your destination, then export your health history.",
  );
  const [details, setDetails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [autoStatus, setAutoStatus] = useState<AutomaticStatus | null>(null);
  const pause = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    async function loadSettings() {
      const [storedEndpoint, storedSecret] = await Promise.all([
        SecureStore.getItemAsync(keys.endpoint),
        SecureStore.getItemAsync(keys.secret),
      ]);
      if (storedEndpoint !== null) {
        setEndpoint(
          storedEndpoint === "https://health-exporter-api.ericventor97.workers.dev"
            ? "https://health-export.ericventor.com"
            : storedEndpoint,
        );
      }
      if (storedSecret !== null) {
        setSecret(storedSecret);
      }
    }
    async function loadAutomatic() {
      const status = await HealthKit.automaticStatus();
      setAutoStatus(status);
      if (status.configured) {
        setAutomatic(status.enabled);
      }
    }
    void loadAutomatic().catch(() => setMessage("Could not read automatic sync status."));
    const timer = setInterval(() => {
      if (AppState.currentState === "active") {
        void HealthKit.automaticStatus()
          .then(setAutoStatus)
          .catch(() => undefined);
      }
    }, 10_000);
    void loadSettings().catch(() => setMessage("Unable to load saved settings. Enter them again."));
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        pause.current = true;
      }
    });
    return () => {
      pause.current = true;
      listener.remove();
      clearInterval(timer);
    };
  }, []);

  async function destination() {
    const url = validateDestination(endpoint, secret.trim());
    let deviceId = await SecureStore.getItemAsync(keys.deviceId);
    if (deviceId === null) {
      deviceId = Crypto.randomUUID();
      await SecureStore.setItemAsync(keys.deviceId, deviceId);
    }
    await Promise.all([
      SecureStore.setItemAsync(keys.endpoint, url),
      SecureStore.setItemAsync(keys.secret, secret.trim()),
    ]);
    return { url, secret: secret.trim(), deviceId };
  }

  async function sync(fromBeginning = false) {
    if (running.current) {
      return;
    }
    running.current = true;
    pause.current = false;
    setBusy(true);
    setDetails([]);
    try {
      await HealthKit.beginForeground();
      const target = await destination();
      await HealthKit.requestPermissions();
      await HealthKit.configureAutomatic(target.url, target.secret, target.deviceId, automatic);
      setAutoStatus(await HealthKit.automaticStatus());
      await HealthKit.keepAwake(true);
      const result = await exportHealth({
        destination: target,
        reader: HealthKit,
        fromBeginning,
        paused: () => pause.current,
        progress: setMessage,
      });
      setDetails(result.errors);
      setMessage(
        result.paused
          ? `Paused. ${result.sent.toLocaleString()} records sent. Tap Export / resume to continue.`
          : result.errors.length
            ? `Partial export: ${result.completed} types checked; ${result.errors.length} need attention. Saved progress is preserved.`
            : `Export finished for all readable types. ${result.sent.toLocaleString()} records sent this session. Types without permission or data may be empty.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Export interrupted. Tap Export / resume to retry.",
      );
    } finally {
      await HealthKit.keepAwake(false).catch(() => undefined);
      await HealthKit.endForeground().catch(() => undefined);
      running.current = false;
      setBusy(false);
    }
  }

  async function toggleAutomatic(enabled: boolean) {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      await HealthKit.beginForeground();
      if (enabled) {
        const target = await destination();
        await HealthKit.requestPermissions();
        await HealthKit.configureAutomatic(target.url, target.secret, target.deviceId, true);
      } else {
        await HealthKit.disableAutomatic();
      }
      setAutomatic(enabled);
      setAutoStatus(await HealthKit.automaticStatus());
      setMessage(
        enabled
          ? "Automatic updates enabled. iOS will schedule uploads; the first large export is faster with this app open."
          : "Automatic updates disabled. You can still export manually.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change automatic updates.");
    } finally {
      await HealthKit.endForeground().catch(() => undefined);
      running.current = false;
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      const status = await archiveStatus(await destination());
      setMessage(
        `Destination: ${status.totalRecords.toLocaleString()} stored records across ${status.types.length} data types.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Destination unavailable.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.title}>Health Exporter</Text>
        <Text>
          Export your full accessible Apple Health history to your destination. No seven-day or
          total sample limit.
        </Text>
        <Text>
          Keep this app open for the first large export. After setup, automatic updates send new
          data when iOS allows. You choose what Apple Health allows this app to read.
        </Text>
        <Text style={styles.label}>Destination URL</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
          onChangeText={setEndpoint}
          style={styles.input}
          value={endpoint}
        />
        <Text style={styles.label}>Access key</Text>
        <Text>Use the Health Exporter secret saved in Proton Pass.</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={setSecret}
          secureTextEntry
          style={styles.input}
          value={secret}
        />
        <View style={styles.automaticRow}>
          <Text style={styles.label}>Automatic updates</Text>
          <Switch
            value={automatic}
            disabled={busy}
            onValueChange={(value) => void toggleAutomatic(value)}
          />
        </View>
        <Text>
          {autoStatus?.configured
            ? autoStatus.message
            : "Enabled when you start your first export. You can turn it off here."}
        </Text>
        {autoStatus?.lastSuccess ? (
          <Text>Last automatic check: {new Date(autoStatus.lastSuccess).toLocaleString()}</Text>
        ) : null}
        <Text>
          Background timing is controlled by iOS. Locked health data waits until it becomes
          available. If you force-quit the app, reopen it to resume automatic updates.
        </Text>
        <Button disabled={busy} onPress={() => void sync()} title="Export / resume" />
        {busy && (
          <Button
            onPress={() => {
              pause.current = true;
              setMessage("Pausing after the current read or upload…");
            }}
            title="Pause export"
          />
        )}
        <Button disabled={busy} onPress={() => void refreshStatus()} title="Check destination" />
        <Button
          disabled={busy}
          onPress={() =>
            Alert.alert(
              "Export from beginning?",
              "Re-read all accessible history, including newly granted data types. Existing records are deduplicated.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Export all history", onPress: () => void sync(true) },
              ],
            )
          }
          title="Export from beginning"
        />
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
        {details.map((detail) => (
          <Text key={detail} style={styles.message}>
            {detail}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: "#f4f6f8",
    justifyContent: "center",
    padding: 24,
    paddingTop: 64,
    paddingBottom: 40,
  },
  automaticRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  card: { backgroundColor: "white", borderRadius: 16, gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "600" },
  input: { borderColor: "#9ca3af", borderRadius: 8, borderWidth: 1, padding: 12 },
  message: { color: "#374151", marginTop: 8 },
});
