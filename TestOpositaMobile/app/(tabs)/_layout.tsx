import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View, Text, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    const verificarSesionLocal = async () => {
      try {
        const userId = await AsyncStorage.getItem('user_id');
        if (!userId) router.replace('/login');
      } catch (e) {}
    };
    verificarSesionLocal();
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.icon,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 80 : 64,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        headerShown: true,
        headerTitle: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 22 }}>🦉</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>
              TestOposita
            </Text>
          </View>
        ),
        headerStyle: {
          backgroundColor: colors.card,
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        } as any,
        headerTintColor: colors.text,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push('/perfil' as any)}
            style={{
              marginRight: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isDark ? '#334155' : '#F2F2F7',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={20} color={colors.tint} />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="estadisticas"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Tienda',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'cart' : 'cart-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
