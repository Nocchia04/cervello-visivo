import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import { ApolloProvider } from "@apollo/client";
import { NavigationContainer } from "@react-navigation/native";
import { apolloClient } from "./src/lib/apollo-client";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { uploadWorker } from "./src/services/upload/UploadWorker";

export default function App() {
  useEffect(() => {
    // Start the upload worker to process queued photos when online
    uploadWorker.start();
    return () => uploadWorker.stop();
  }, []);

  return (
    <ApolloProvider client={apolloClient}>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />
        <AppNavigator />
      </NavigationContainer>
    </ApolloProvider>
  );
}
