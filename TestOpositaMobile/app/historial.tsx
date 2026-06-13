import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, ScrollView, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { useRouter, useLocalSearchParams } from 'expo-router'; // 👈 Añadido useLocalSearchParams

import { Ionicons } from '@expo/vector-icons';

// 👇 Importamos Config y Tema
import { API_URL } from './config';
import { useTheme } from '../context/ThemeContext';

export default function HistorialScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme(); // 👈 Activamos modo oscuro

  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para el detalle
  const [preguntasVisualizar, setPreguntasVisualizar] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [examenActualTitulo, setExamenActualTitulo] = useState('');
  // Recibimos cursoId para filtrar (opcional)
  const params = useLocalSearchParams();
  const filtroCursoId = params.cursoId ? parseInt(params.cursoId as string) : null;
  useEffect(() => {
    cargarHistorial();
  }, []);

  const cargarHistorial = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;

      const res = await api.get(`/historial`);
      setHistorial(res.data);
    } catch (error) {
      console.error("Error cargando historial:", error);
    } finally {
      setLoading(false);
    }
  };

  const abrirDetalle = (examen: any) => {
    setExamenActualTitulo(examen.nombre_referencia || "Revisión");
    
    try {
        let preguntasArray = [];
        if (typeof examen.contenido_json === 'string') {
            preguntasArray = JSON.parse(examen.contenido_json);
        } else if (Array.isArray(examen.preguntas)) {
            preguntasArray = examen.preguntas;
        } else {
            preguntasArray = examen.contenido_json || []; 
        }
        setPreguntasVisualizar(preguntasArray);
    } catch (e) {
        setPreguntasVisualizar([]);
    }
    
    setModalVisible(true);
  };

  // 👇 FUNCIÓN CLAVE: REINTENTAR EL MISMO TEST
  const reintentarTest = () => {
    setModalVisible(false);
    
    // 👇 CORRECCIÓN DE RUTA: Apuntamos a /examen (donde está tu archivo real)
    router.push({
        pathname: '/test',
        params: { 
            data: JSON.stringify(preguntasVisualizar),
            cursoId: filtroCursoId // Mantenemos el contexto del curso al volver
        }
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    const total = item.total_preguntas || item.total || 0; 
    const aciertos = item.aciertos || 0;
    const nota = total > 0 ? (aciertos / total) * 10 : 0;
    
    // Color semáforo para la nota
    let colorNota = colors.error; 
    if (nota >= 5) colorNota = '#eab308'; 
    if (nota >= 7) colorNota = colors.success;

    const esReto = item.tipo === 'nivel_reto';

    return (
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: colors.card }]} 
        onPress={() => abrirDetalle(item)}
      >
        <View style={styles.cardHeader}>
            {/* ICONO */}
            <View style={[
                styles.iconBox, 
                { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : (esReto ? '#eef2ff' : '#fff7ed') }
            ]}>
                <Ionicons 
                    name={esReto ? "trophy" : "flash"} 
                    size={24} 
                    color={esReto ? "#6366f1" : "#f97316"} 
                />
            </View>

            {/* INFO */}
            <View style={{flex: 1, marginLeft: 15}}>
                <Text style={[styles.tituloCard, { color: colors.text }]}>
                    {item.nombre_referencia || (esReto ? "Nivel de Reto" : "Test Rápido")}
                </Text>
                <Text style={[styles.fecha, { color: colors.subtext }]}>
                    {new Date(item.fecha).toLocaleDateString()}
                </Text>
            </View>

            {/* NOTA */}
            <View style={[styles.badgeNota, { backgroundColor: colorNota }]}>
                <Text style={styles.textoNota}>{aciertos}/{total}</Text>
            </View>
        </View>
        <Text style={[styles.verDetalles, { color: colors.tint }]}>Ver corrección 👉</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* Cabecera */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.btnAtras}>
            <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.titulo, { color: colors.text }]}>Historial 📜</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{marginTop: 50}} />
      ) : historial.length === 0 ? (
        <View style={styles.emptyState}>
            <Ionicons name="documents-outline" size={60} color={colors.border}/>
            <Text style={{color: colors.subtext, marginTop:10}}>No has hecho ningún examen todavía.</Text>
        </View>
      ) : (
        <FlatList
            data={historial}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      {/* --- MODAL DE DETALLE Y REINTENTO --- */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={{flex: 1, backgroundColor: colors.background}}>
            
            {/* Cabecera Modal */}
            <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={28} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.modalTitulo, { color: colors.text }]}>Revisión</Text>
                
                {/* 🔥 BOTÓN REINTENTAR EN LA CABECERA */}
                <TouchableOpacity onPress={reintentarTest} style={{flexDirection:'row', alignItems:'center', gap:5}}>
                    <Text style={{color: colors.tint, fontWeight:'bold'}}>Repetir</Text>
                    <Ionicons name="refresh-circle" size={28} color={colors.tint} />
                </TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={{padding: 20}}>
                {preguntasVisualizar.length === 0 ? (
                    <Text style={{textAlign:'center', marginTop:20, color: colors.subtext}}>Detalles no disponibles.</Text>
                ) : (
                    preguntasVisualizar.map((preg: any, index: number) => {
                        const enunciado = preg.Pregunta || preg.pregunta || "¿Pregunta sin texto?";
                        const opciones = preg.Opciones || preg.opciones || [];
                        const explicacion = preg.Explicacion || preg.explicacion || "Sin explicación.";
                        const correctaIdx = preg.Indice_correcta !== undefined ? preg.Indice_correcta : preg.respuesta_correcta;
                        
                        // Recuperamos lo que marcó el usuario (si existe)
                        const seleccionUsuario = preg.seleccion_usuario; 

                        return (
                            <View key={index} style={[styles.preguntaBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <Text style={[styles.numeroPregunta, { color: colors.subtext }]}>Pregunta {index + 1}</Text>
                                <Text style={[styles.textoPregunta, { color: colors.text }]}>{enunciado}</Text>
                                
                                {/* Opciones */}
                                {opciones.map((op: string, idx: number) => {
                                    const esLaCorrecta = idx === correctaIdx;
                                    const esElFallo = idx === seleccionUsuario && !esLaCorrecta; // Marcada pero mal

                                    // Lógica de colores de revisión
                                    let bg = colors.background; // Neutral
                                    let border = colors.border;
                                    let textColor = colors.text;

                                    if (esLaCorrecta) {
                                        bg = isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7'; 
                                        border = colors.success;
                                    } else if (esElFallo) {
                                        bg = isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2';
                                        border = colors.error;
                                    }

                                    return (
                                        <View key={idx} style={[
                                            styles.opcionBox, 
                                            { backgroundColor: bg, borderColor: border }
                                        ]}>
                                            <Text style={[
                                                styles.textoOpcion, 
                                                { color: textColor },
                                                esLaCorrecta && {fontWeight: 'bold', color: colors.success},
                                                esElFallo && {color: colors.error}
                                            ]}>
                                                {esLaCorrecta ? '✅ ' : (esElFallo ? '❌ ' : '⚪ ')} {op}
                                            </Text>
                                        </View>
                                    );
                                })}
                                
                                <View style={[styles.explicacionContainer, { borderTopColor: colors.border }]}>
                                    <Text style={{fontWeight: 'bold', color: isDark ? '#fbbf24' : '#d97706', marginBottom: 5}}>💡 Explicación:</Text>
                                    <Text style={{color: colors.subtext, fontSize: 14, lineHeight: 20}}>{explicacion}</Text>
                                </View>
                            </View>
                        );
                    })
                )}
                <View style={{height: 50}}/>
            </ScrollView>

            {/* BOTÓN FLOTANTE GRANDE DE REINTENTAR (Opcional, por si el de arriba es pequeño) */}
            <View style={{padding: 20, borderTopWidth:1, borderColor: colors.border}}>
                <TouchableOpacity 
                    onPress={reintentarTest} 
                    style={{backgroundColor: colors.tint, padding: 15, borderRadius: 15, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:10}}
                >
                    <Ionicons name="refresh" size={24} color="white" />
                    <Text style={{color:'white', fontWeight:'bold', fontSize:18}}>Volver a hacer este Test</Text>
                </TouchableOpacity>
            </View>

        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  btnAtras: { marginRight: 15 },
  titulo: { fontSize: 24, fontWeight: 'bold' },
  
  // Lista
  card: { padding: 15, borderRadius: 16, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 5 },
  tituloCard: { fontSize: 16, fontWeight: 'bold' },
  fecha: { fontSize: 12, marginTop: 2 },
  
  badgeNota: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, marginLeft: 'auto' },
  textoNota: { color: 'white', fontWeight: 'bold' },
  verDetalles: { fontWeight: '600', marginTop: 5, textAlign: 'right', fontSize: 12 },
  emptyState: { marginTop: 50, alignItems: 'center' },

  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  modalTitulo: { fontSize: 18, fontWeight: 'bold' },
  preguntaBox: { padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1 },
  numeroPregunta: { fontSize: 12, marginBottom: 5, fontWeight: 'bold' },
  textoPregunta: { fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  opcionBox: { padding: 12, borderRadius: 8, marginBottom: 5, borderWidth: 1 },
  textoOpcion: { fontSize: 14 },
  explicacionContainer: { marginTop: 15, paddingTop: 15, borderTopWidth: 1 },
});