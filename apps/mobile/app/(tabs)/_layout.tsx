import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useTheme } from '@/components/ui';

const icon = (emoji: string) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

export default function TabsLayout() {
  const { t } = useTranslation();
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.outings'), tabBarIcon: icon('📍') }} />
      <Tabs.Screen name="friends" options={{ title: t('tabs.friends'), tabBarIcon: icon('👥') }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages'), tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('🙂') }} />
    </Tabs>
  );
}
