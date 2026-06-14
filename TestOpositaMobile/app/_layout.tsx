import { Stack } from 'expo-router';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

import { StatusBar } from 'expo-status-bar'; 
import { TaskManagerProvider } from '../context/TaskManagerContext';
import GlobalNotification from '../components/GlobalNotification'; 
// 👇 1. IMPORTAMOS EL PROVEEDOR DE ENERGÍA
import { EnergyProvider } from '../context/EnergyContext';
// 💎 PROVEEDOR DE ECONOMÍA UNIFICADA (vidas, rubíes, racha, estrellas)
import { EconomyProvider } from '../context/EconomyContext';

// Componente auxiliar para usar el hook dentro del Provider
function RootNavigator() {
  const { isDark } = useTheme(); // Para saber si estamos en oscuro
  
  return (
    <>
      {/* Esto cambia el color de la hora/batería automáticamente */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="perfil" />
        <Stack.Screen name="historial" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
       {/* 👇 2. ENVUELVE TODO EL MOTOR CON EL ENERGY PROVIDER 👇 */}
       <EnergyProvider>
         {/* 💎 Economía unificada disponible en toda la app */}
         <EconomyProvider>
           <TaskManagerProvider>
            <GlobalNotification />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="curso/[id]" />
                {/* ... resto de screens ... */}
              </Stack>
           </TaskManagerProvider>
         </EconomyProvider>
       </EnergyProvider>
    </ThemeProvider>
  );
}