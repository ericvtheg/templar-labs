import { requireNativeModule } from "expo-modules-core";
import type { HealthReader } from "./sync.ts";

export default requireNativeModule<HealthReader & { keepAwake(enabled: boolean): Promise<void> }>(
  "TemplarHealthKit",
);
