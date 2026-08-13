import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Image, SafeAreaView, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { findByBarcode, setConfig, type LegoCatalogItem } from '@anti-kragle/core';

const { rebrickableApiKey, supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

setConfig({ rebrickableApiKey, supabaseUrl, supabaseAnonKey });

const ACCENT = '#c92f2f';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<LegoCatalogItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const handleBarCodeScanned = useCallback(async ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const item = await findByBarcode(data);
      if (isMountedRef.current) {
        setResult(item ?? null);
        if (!item) setError(`No LEGO set found for barcode ${data}`);
      }
    } catch {
      if (isMountedRef.current) setError('Failed to look up barcode. Please try again.');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [scanned]);

  const reset = () => {
    setScanned(false);
    setResult(null);
    setError(null);
    setLoading(false);
  };

  if (!permission) {
    return <SafeAreaView style={styles.center}><Text>Initialising camera…</Text></SafeAreaView>;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permText}>Camera access is needed to scan barcodes.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
      />

      {/* Viewfinder */}
      {!scanned && (
        <View style={styles.viewfinderWrapper}>
          <View style={styles.viewfinder} />
          <Text style={styles.hint}>Point at a LEGO set barcode</Text>
        </View>
      )}

      {/* Result overlay */}
      {scanned && (
        <SafeAreaView style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.card}>
            {loading && <Text style={styles.statusText}>Looking up set…</Text>}

            {error && <Text style={[styles.statusText, { color: ACCENT }]}>{error}</Text>}

            {result && (
              <>
                {result.imageUrl ? (
                  <Image source={{ uri: result.imageUrl }} style={styles.setImage} resizeMode="contain" />
                ) : null}
                <Text style={styles.setName}>{result.name}</Text>
                <Text style={styles.setMeta}>
                  {result.theme} · {result.year} · {result.pieceCount.toLocaleString()} pieces
                </Text>
                <Text style={styles.setNumber}>#{result.number}</Text>
              </>
            )}

            <TouchableOpacity style={[styles.btn, { marginTop: 16 }]} onPress={reset}>
              <Text style={styles.btnText}>Scan again</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permText: { textAlign: 'center', marginBottom: 16, fontSize: 15 },
  viewfinderWrapper: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  viewfinder: {
    width: 240, height: 160, borderRadius: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)',
  },
  hint: {
    marginTop: 16, color: 'white', fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14,
    paddingVertical: 6, borderRadius: 20, overflow: 'hidden',
  },
  overlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, alignItems: 'center',
  },
  setImage: { width: 200, height: 150, marginBottom: 12 },
  setName: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  setMeta: { fontSize: 14, color: '#5c6670', marginBottom: 4 },
  setNumber: { fontSize: 12, color: '#8a949e', fontFamily: 'monospace' },
  statusText: { fontSize: 16, marginBottom: 12, textAlign: 'center' },
  btn: {
    backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 10, alignSelf: 'stretch', alignItems: 'center',
  },
  btnText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
