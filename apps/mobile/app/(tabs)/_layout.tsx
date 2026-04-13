import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/useTheme';

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor:  colors.border,
          borderTopWidth:  1,
          height:          60 + insets.bottom,
          paddingBottom:   8 + insets.bottom,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle:        { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen name="index"        options={{ title: 'Dashboard',    tabBarIcon: ({ color }) => <Ionicons name="home"      size={22} color={color} /> }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions', tabBarIcon: ({ color }) => <Ionicons name="list"      size={22} color={color} /> }} />
      <Tabs.Screen name="budget"       options={{ title: 'Budget',       tabBarIcon: ({ color }) => <Ionicons name="pie-chart" size={22} color={color} /> }} />
      <Tabs.Screen name="goals"        options={{ title: 'Goals',        tabBarIcon: ({ color }) => <Ionicons name="flag"      size={22} color={color} /> }} />
      <Tabs.Screen name="insights"     options={{ title: 'Insights',     tabBarIcon: ({ color }) => <Ionicons name="bulb"      size={22} color={color} /> }} />
      <Tabs.Screen name="statistics"   options={{ title: 'Stats',        tabBarIcon: ({ color }) => <Ionicons name="bar-chart" size={22} color={color} /> }} />
    </Tabs>
  );
}
