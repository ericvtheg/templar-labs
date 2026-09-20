import { requireNativeModule } from "expo-modules-core";
import type { HealthReader } from "./sync.ts";

export type AutomaticStatus = {
  enabled: boolean;
  configured: boolean;
  running: boolean;
  pendingTypes: number;
  lastSuccess: string;
  message: string;
};

export default requireNativeModule<
  HealthReader & {
    keepAwake(enabled: boolean): Promise<void>;
    configureAutomatic(
      url: string,
      secret: string,
      deviceId: string,
      enabled: boolean,
    ): Promise<void>;
    disableAutomatic(): Promise<void>;
    automaticStatus(): Promise<AutomaticStatus>;
    beginForeground(): Promise<void>;
    endForeground(): Promise<void>;
  }
>("TemplarHealthKit");
