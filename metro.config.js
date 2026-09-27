const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// SDK 57 inlines public environment variables into production transforms.
// Keep transforms separate when switching launch options without clearing Metro.
const demoEnabled = process.env.EXPO_PUBLIC_ENABLE_DEMO === "true";
const resetOnStart = process.env.EXPO_PUBLIC_RESET_ON_START === "true";
config.cacheVersion = `${config.cacheVersion}:lad-demo-${demoEnabled}:reset-${resetOnStart}`;

module.exports = config;
