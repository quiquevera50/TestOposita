import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  // ==========================================
  // 🛡️ GUARDIÁN LOCAL (RÁPIDO) 🛡️
  // ==========================================
  useEffect(() => {
    const verificarSesionLocal = async () => {
      try {
        const userId = await AsyncStorage.getItem('user_id');
        if (!userId) {
          router.replace('/login'); 
        }
      } catch (error) {
        console.log("Error leyendo el almacenamiento local:", error);
      }
    };

    verificarSesionLocal();
  }, []);
  // ==========================================

  return (
      <Tabs screenOptions={{ 
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.icon,
        tabBarStyle: { 
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 60, 
          paddingBottom: 5 
        },
        headerShown: true, 
        headerTitle: "TestOposita 🦉",
        headerStyle: {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          borderBottomWidth: isDark ? 1 : 0,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTintColor: colors.text,
        headerRight: () => (
          <TouchableOpacity onPress={() => router.push('/perfil' as any)} style={{ marginRight: 15 }}>
              <Ionicons name="person-circle-outline" size={34} color={colors.tint} />
          </TouchableOpacity>
        ),
      }}>
        {/* 👇 Pestaña 1: El Home */}
        <Tabs.Screen 
            name="index" 
            options={{ 
                title: 'Inicio',
                tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />
            }} 
        />
         {/* 👇 Pestaña 2: Las Estadísticas */}
        <Tabs.Screen 
            name="estadisticas" 
            options={{ 
                title: 'Stats', 
                tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={24} color={color} /> 
            }} 
        />
        {/* 👇 Pestaña 3: La Tienda (explore.tsx) */}
        <Tabs.Screen 
            name="shop" 
            options={{ 
                title: 'Tienda',
                tabBarIcon: ({ color }) => <Ionicons name="cart" size={24} color={color} />
            }} 
        />
      </Tabs>
  );
}