import { Stack } from 'expo-router';
import { ApolloProvider } from '@apollo/client';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { apolloClient } from '../src/lib/apollo-client';
import { uploadWorker } from '../src/services/upload/UploadWorker';
import { colors } from '../src/lib/theme';

export default function RootLayout() {
  useEffect(() => {
    uploadWorker.start();
    return () => uploadWorker.stop();
  }, []);

  return (
    <ApolloProvider client={apolloClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.white,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          } as any,
          headerTintColor: colors.accent,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="cantieri" options={{ title: 'Cantieri', headerLeft: () => null }} />
        <Stack.Screen name="piantina/[cantiereId]" options={{ title: 'Piantina' }} />
        <Stack.Screen name="scatto/[puntoId]" options={{ title: 'Scatto' }} />
        <Stack.Screen name="annotazioni/[puntoId]" options={{ title: 'Annotazioni' }} />
        <Stack.Screen name="foto360/[puntoId]" options={{ title: 'Foto 360°' }} />
      </Stack>
    </ApolloProvider>
  );
}
