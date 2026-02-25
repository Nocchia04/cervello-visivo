import { Redirect } from 'expo-router';
import { getAuthToken } from '../src/lib/storage';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getAuthToken().then(t => { setToken(t); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#1E40AF" />
      </View>
    );
  }

  return <Redirect href={token ? '/(tabs)' : '/login'} />;
}
