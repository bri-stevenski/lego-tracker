const path = require('path');
// Load keys from the monorepo root .env (VITE_* prefix is fine — we remap below)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  expo: {
    name: 'Anti-Kragle',
    slug: 'brick-ledger',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.brickledger.app',
      infoPlist: {
        NSCameraUsageDescription: 'Used to scan LEGO set barcodes.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.brickledger.app',
    },
    plugins: [
      ['expo-camera', { cameraPermission: 'Allow Anti-Kragle to scan LEGO set barcodes.' }],
    ],
    extra: {
      rebrickableApiKey: process.env.VITE_REBRICKABLE_API_KEY ?? '',
      supabaseUrl: process.env.VITE_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    },
  },
};
