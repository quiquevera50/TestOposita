import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
// 👇 1. Importamos el Gestor de Tareas para ver las novedades
import { useTaskManager } from '../../context/TaskManagerContext';

export default function DetalleCursoScreen() {
  const { id, nombre } = useLocalSearchParams();
  const router = useRouter();
  const { colors, isDark } = useTheme();

  // 👇 2. Sacamos las novedades del contexto
  const { novedades } = useTaskManager();
  
  // Aseguramos que el ID es un string para buscar en el objeto
  const cursoId = Array.isArray(id) ? id[0] : id;
  
  // Verificamos si hay aviso (true/false) para este curso específico
  const hayRetoNuevo = novedades[cursoId!]?.reto; 
  const hayTestNuevo = novedades[cursoId!]?.test;
  const hayOficialNuevo = novedades[cursoId!]?.oficial;
  return (
    <View style={{flex: 1, backgroundColor: colors.background}}>
      
        {/* CABECERA CURSO */}
        <View style={[styles.header, {backgroundColor: colors.card}]}>
            <TouchableOpacity onPress={() => router.back()} style={{padding: 5}}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, {color: colors.text}]} numberOfLines={1}>
                {nombre}
            </Text>
            
        </View>

        <ScrollView contentContainerStyle={{padding: 20}}>
            
            {/* MASCOTA / GUIDANCE */}
            <View style={[styles.mascotaBox, {backgroundColor: isDark ? '#1e293b' : '#e0f2fe'}]}>
                <Text style={{fontSize: 40}}>🦉</Text>
                <View style={{flex:1, marginLeft: 15}}>
                    <Text style={{color: colors.text, fontWeight:'bold', fontSize: 16}}>
                        ¡Vamos con {nombre}!
                    </Text>
                    <Text style={{color: colors.subtext, fontSize: 13}}>
                        Sube apuntes para que pueda prepararte exámenes.
                    </Text>
                </View>
            </View>

            {/* 1. BIBLIOTECA */}
            <TouchableOpacity 
                style={[styles.actionCard, {backgroundColor: colors.card}]}
                onPress={() => router.push({
                    pathname: "/biblioteca",
                    params: { cursoId: id, cursoNombre: nombre } 
                })}
            >
                <View style={[styles.iconCircle, {backgroundColor: '#dcfce7'}]}>
                    <Ionicons name="library" size={30} color="#166534" />
                </View>
                <View style={{flex:1}}>
                    <Text style={[styles.actionTitle, {color: colors.text}]}>Biblioteca del Curso</Text>
                    <Text style={{color: colors.subtext}}>Sube tus PDFs aquí</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={colors.border} />
            </TouchableOpacity>

            {/* 2. TEST RÁPIDO */}
            <TouchableOpacity 
                style={[styles.actionCard, {backgroundColor: colors.card}]}
                onPress={() => router.push({
                    pathname: "/test",
                    params: { cursoId: id, cursoNombre: nombre }
                })}
            >
                <View style={[styles.iconCircle, {backgroundColor: '#ffedd5'}]}>
                    <Ionicons name="flash" size={30} color="#c2410c" />
                </View>
                <View style={{flex:1}}>
                    <Text style={[styles.actionTitle, {color: colors.text}]}>Test Rápido</Text>
                    <Text style={{color: colors.subtext}}>Practica preguntas sueltas</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={colors.border} />

                {/* 🔴 PUNTO ROJO DE AVISO */}
                {hayTestNuevo && (
                    <View style={[styles.badge, { borderColor: colors.card }]} />
                )}
            </TouchableOpacity>

            {/* 3. EXAMEN OFICIAL */}
            <TouchableOpacity 
                style={[styles.actionCard, {backgroundColor: colors.card}]}
                onPress={() => router.push({
                    pathname: "/examen",
                    params: { cursoId: id, cursoNombre: nombre }
                })}
            >
                <View style={[styles.iconCircle, {backgroundColor: '#fef2f2'}]}>
                    <Ionicons name="newspaper" size={30} color="#991b1b" />
                </View>
                <View style={{flex:1}}>
                    <Text style={[styles.actionTitle, {color: colors.text}]}>Examen Oficial</Text>
                    <Text style={{color: colors.subtext}}>Convierte tus PDFs en tests reales</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={colors.border} />
                
                {/* 🔴 PUNTO ROJO DE AVISO */}
                {hayOficialNuevo && (
                    <View style={[styles.badge, { borderColor: colors.card }]} />
                )}
            </TouchableOpacity>

            {/* 4. MODO RETO */}
            <TouchableOpacity 
                style={[styles.actionCard, {backgroundColor: colors.card}]}
                onPress={() => router.push({
                    pathname: "/reto",
                    params: { cursoId: id, cursoNombre: nombre }
                })}
            >
                <View style={[styles.iconCircle, {backgroundColor: '#e0e7ff'}]}>
                    <Ionicons name="trophy" size={30} color="#4338ca" />
                </View>
                <View style={{flex:1}}>
                    <Text style={[styles.actionTitle, {color: colors.text}]}>Modo Reto</Text>
                    <Text style={{color: colors.subtext}}>Tu camino al aprobado</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={colors.border} />

                {/* 🔴 PUNTO ROJO DE AVISO */}
                {hayRetoNuevo && (
                    <View style={[styles.badge, { borderColor: colors.card }]} />
                )}
            </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20, paddingTop: 50, flexDirection:'row', alignItems:'center', justifyContent:'space-between', elevation: 4 },
  title: { fontSize: 20, fontWeight:'bold', flex:1, textAlign:'center', marginHorizontal: 10 },
  mascotaBox: { flexDirection:'row', padding: 20, borderRadius: 16, alignItems:'center', marginBottom: 30 },
  actionCard: { flexDirection:'row', padding: 20, borderRadius: 16, alignItems:'center', marginBottom: 15, gap: 15, elevation: 2 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent:'center', alignItems:'center' },
  actionTitle: { fontSize: 18, fontWeight:'bold', marginBottom: 4 },
  
  // 👇 ESTILO DEL PUNTO ROJO
  badge: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ef4444', // Rojo intenso
    borderWidth: 2,
    zIndex: 10
  }
});