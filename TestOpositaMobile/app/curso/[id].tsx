import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useTaskManager } from '../../context/TaskManagerContext';
import { EconomyBar } from '../../components/EconomyBar';
import { useSafeBack } from '../../hooks/useSafeBack';

export default function DetalleCursoScreen() {
  const { id, nombre } = useLocalSearchParams();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { novedades } = useTaskManager();
  const volver = useSafeBack('/(tabs)');

  const cursoId = Array.isArray(id) ? id[0] : id;
  const hayRetoNuevo = novedades[cursoId!]?.reto;
  const hayTestNuevo = novedades[cursoId!]?.test;
  const hayOficialNuevo = novedades[cursoId!]?.oficial;

  // Tarjetas principales (modos de estudio)
  const MODOS = [
    {
      key: 'resumen', titulo: 'Resumen', sub: 'Estudia con IA',
      icon: 'book' as const, color: '#1CB0F6',
      onPress: () => router.push({ pathname: '/resumen', params: { cursoId: id, cursoNombre: nombre } }),
      aviso: false,
    },
    {
      key: 'test', titulo: 'Test', sub: 'Practica y repasa fallos',
      icon: 'flash' as const, color: '#FF9600',
      onPress: () => router.push({ pathname: '/test', params: { cursoId: id, cursoNombre: nombre } }),
      aviso: hayTestNuevo,
    },
    {
      key: 'examen', titulo: 'Examen Oficial', sub: 'Tests reales',
      icon: 'newspaper' as const, color: '#FF4B4B',
      onPress: () => router.push({ pathname: '/examen', params: { cursoId: id, cursoNombre: nombre } }),
      aviso: hayOficialNuevo,
    },
    {
      key: 'reto', titulo: 'Modo Reto', sub: 'Tu camino al aprobado',
      icon: 'trophy' as const, color: '#CE82FF',
      onPress: () => router.push({ pathname: '/reto', params: { cursoId: id, cursoNombre: nombre } }),
      aviso: hayRetoNuevo,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* CABECERA */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={volver} style={{ padding: 5 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{nombre}</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* BARRA DE ECONOMÍA */}
      <EconomyBar
        onPressRubies={() => router.push('/(tabs)/shop')}
        onPressVidas={() => {}}
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 16 }}>
        {/* CUADRÍCULA DE MODOS */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {MODOS.map(modo => (
            <TouchableOpacity
              key={modo.key}
              style={{
                width: '48%',
                backgroundColor: colors.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 18,
                marginBottom: 14,
                borderBottomWidth: 4,
                borderBottomColor: isDark ? '#0F172A' : '#E5E5EA',
              }}
              activeOpacity={0.85}
              onPress={modo.onPress}
            >
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: modo.color + (isDark ? '22' : '1A'), justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name={modo.icon} size={28} color={modo.color} />
              </View>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{modo.titulo}</Text>
              <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{modo.sub}</Text>

              {modo.aviso && (
                <View style={{ position: 'absolute', top: 14, right: 14, width: 12, height: 12, borderRadius: 6, backgroundColor: '#FF4B4B', borderWidth: 2, borderColor: colors.card }} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ACCIÓN SECUNDARIA: GESTIONAR PDFS */}
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 14,
            backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
            padding: 16, marginTop: 6,
          }}
          onPress={() => router.push({ pathname: '/biblioteca', params: { cursoId: id, cursoNombre: nombre } })}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? '#334155' : '#F2F2F7', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="folder-open" size={22} color={colors.subtext} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Mis PDFs</Text>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Añadir o eliminar apuntes de este curso</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.border} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: 'bold', flex: 1, textAlign: 'center', marginHorizontal: 10 },
});
