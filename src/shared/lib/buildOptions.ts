// Expo replaces this exact property access when starting Metro or exporting a bundle.
// Development mode alone never enables sample financial data.
export const DEMO_ENABLED = process.env.EXPO_PUBLIC_ENABLE_DEMO === "true";

// A release bundle must never erase data, even if the launch option was set.
export const FRESH_START_ENABLED =
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_RESET_ON_START === "true";
