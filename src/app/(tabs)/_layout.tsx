import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';

function TabIcon({ emoji, color }: { emoji: string; color: ColorValue }) {
  return <Text style={{ fontSize: 22, color }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const theme = useTheme();
  // On desktop the left sidebar handles navigation, so hide the bottom tab bar.
  const { isDesktop } = useResponsive();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          display: isDesktop ? 'none' : 'flex',
        },
      }}>
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutrition',
          tabBarIcon: ({ color }) => <TabIcon emoji="🍽️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Workout',
          tabBarIcon: ({ color }) => <TabIcon emoji="🏋️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="body"
        options={{
          title: 'Body',
          tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}
