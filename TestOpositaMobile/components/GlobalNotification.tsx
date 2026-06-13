// components/GlobalNotification.tsx
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTaskManager } from '../context/TaskManagerContext';
import { useTheme } from '../context/ThemeContext';

export default function GlobalNotification() {
  const { notificacion, cerrarNotificacion } = useTaskManager();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  // Autocierre a los 5 segundos
  useEffect(() => {
    if (notificacion.visible) {
        const timer = setTimeout(() => {
            cerrarNotificacion();
        }, 5000);
        return () => clearTimeout(timer);
    }
  }, [notificacion.visible]);

  if (!notificacion.visible) return null;

  const handlePress = () => {
      cerrarNotificacion();
      if (notificacion.ruta) {
          // 👇 AQUÍ ESTÁ LA MAGIA: Cambiamos 'push' por 'navigate'
          // Esto evita que se superpongan las pantallas de los exámenes
          router.navigate(notificacion.ruta as any);
      }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#1e293b' : '#ffffff', shadowColor: colors.text }]}>
       <TouchableOpacity style={styles.content} onPress={handlePress}>
           <View style={[styles.iconBox, { backgroundColor: colors.tint }]}>
               <Ionicons name="notifications" size={20} color="white" />
           </View>
           <View style={{flex: 1}}>
               <Text style={[styles.title, { color: colors.text }]}>{notificacion.titulo}</Text>
               <Text style={[styles.msg, { color: colors.subtext }]}>{notificacion.mensaje}</Text>
           </View>
       </TouchableOpacity>
       
       <TouchableOpacity onPress={cerrarNotificacion} style={styles.closeBtn}>
           <Ionicons name="close" size={20} color={colors.subtext} />
       </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 60 : 40, // Ajuste para que no tape status bar
      left: 20,
      right: 20,
      borderRadius: 16,
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 9999, // SIEMPRE ARRIBA
      elevation: 10,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
  },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontWeight: 'bold', fontSize: 16 },
  msg: { fontSize: 13 },
  closeBtn: { padding: 5, marginLeft: 5 }
});