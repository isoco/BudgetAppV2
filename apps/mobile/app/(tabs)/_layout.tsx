import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/useTheme';
import { Platform } from 'react-native';

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.4 : 0.1,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -4 },
          elevation: 16,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 1 },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen name="index"        options={{ title: 'Home',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home'      : 'home-outline'}     size={22} color={color} /> }} />
      <Tabs.Screen name="transactions" options={{ title: 'Txns',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'list'      : 'list-outline'}      size={22} color={color} /> }} />
      <Tabs.Screen name="budget"       options={{ title: 'Budget',   tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'}  size={22} color={color} /> }} />
      <Tabs.Screen name="goals"        options={{ title: 'Goals',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'flag'      : 'flag-outline'}      size={22} color={color} /> }} />
      <Tabs.Screen name="savings"      options={{ title: 'Savings',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'wallet'    : 'wallet-outline'}    size={22} color={color} /> }} />
      <Tabs.Screen name="insights"     options={{ title: 'Insights', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'}  size={22} color={color} /> }} />
      <Tabs.Screen name="statistics"   options={{ href: null }} />
    </Tabs>
  );
}
