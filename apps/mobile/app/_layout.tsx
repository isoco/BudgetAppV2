import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { getDb } from '../src/db';
import { getSettings } from '../src/db/queries';
import { colors } from '../src/theme';
import { useThemeStore } from '../src/store/themeStore';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setMode = useThemeStore(s => s.setMode);

  useEffect(() => {
    getDb()
      .then(() => getSettings())
      .then(s => { if (s.theme) setMode(s.theme); })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.dark.bg }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
