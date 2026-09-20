import { requireNativeModule } from "expo-modules-core";

export type StepSample = {
  sampleId: string;
  type: "stepCount";
  value: number;
  unit: "count";
  startAt: string;
  endAt: string;
  source: { bundleIdentifier: string; name: string };
};

type HealthKitModule = {
  requestPermissions(): Promise<void>;
  readRecentSteps(days: number): Promise<StepSample[]>;
};

export default requireNativeModule<HealthKitModule>("TemplarHealthKit");
