import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Modal, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { API_URL } from './config'; 
import { useTheme } from '../context/ThemeContext';
import { useSafeBack } from '../hooks/useSafeBack';

export default function BibliotecaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors, isDark } = useTheme();

  // 👇 2. RECUPERAMOS LOS DATOS DEL CURSO
  const cursoId = params.cursoId ? parseInt(params.cursoId as string) : null;
  const cursoNombre = params.cursoNombre || "Mis Apuntes"; // Si no hay curso, título genérico

  const [apuntes, setApuntes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  // Categorías seleccionadas para el nuevo apunte (por defecto Test y Reto)
  const [modalCategorias, setModalCategorias] = useState(false);
  const [archivoPendiente, setArchivoPendiente] = useState<any>(null);
  const [catsSeleccionadas, setCatsSeleccionadas] = useState<string[]>(['Test Rapido', 'Modo Reto']);

  const volver = useSafeBack(cursoId ? { pathname: '/curso/[id]', params: { id: String(cursoId), nombre: String(cursoNombre) } } : '/(tabs)');

  const styles = StyleSheet.create({
    container: { flex: 1 },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 10 },
    tituloHeader: { fontSize: 24, fontWeight: 'bold' },
    card: { flexDirection: 'row', padding: 15, borderRadius: 16, marginBottom: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    iconContainer: { width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    infoContainer: { flex: 1 },
    nombreArchivo: { fontSize: 16, fontWeight: '600' },
    subtexto: { fontSize: 13, marginTop: 2 },
    deleteBtn: { padding: 10 },
    fab: { position: 'absolute', bottom: 30, right: 30, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, elevation: 6 },
    emptyState: { alignItems: 'center', marginTop: 100 },
    emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 20 },
    emptySubtext: { fontSize: 14, marginTop: 5 },
    header: { 
        paddingHorizontal: 20, 
        paddingTop: 50,
        paddingBottom: 15,
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        elevation: 4,
        zIndex: 10,
    },
    headerTitle: { 
        fontSize: 20, 
        fontWeight: 'bold', 
        flex: 1, 
        textAlign: 'center', 
        marginHorizontal: 10 
    },
  });

  useFocusEffect(
    useCallback(() => {
      cargarApuntes();
    }, [cursoId]) // Se recarga si cambia el curso
  );

  const cargarApuntes = async () => {
    setLoading(true);
    try {
      // 1. Ya no necesitamos pedir el userId al móvil
      
      // 2. Rutas súper limpias, sin API_URL y sin ID de usuario
      let url = `/apuntes`;
      if (cursoId) {
          url = `/apuntes-curso/${cursoId}`;
      }

      // 3. Petición directa
      const response = await api.get(url);
      setApuntes(response.data);
    } catch (error) {
      console.log("Error cargando apuntes", error);
    } finally {
      setLoading(false);
    }
  };

  // 1. El usuario elige el archivo
  const elegirPDF = async () => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (resultado.canceled) return;
      
      // Guardamos el archivo temporalmente y abrimos el modal
      setArchivoPendiente(resultado.assets[0]);
      setModalCategorias(true);
    } catch (error) {
      Alert.alert("Error", "No se pudo seleccionar el archivo");
    }
  };

  // 2. El usuario confirma las categorías y se sube
  const confirmarSubida = async () => {
    if (!archivoPendiente || catsSeleccionadas.length === 0) {
      Alert.alert("Aviso", "Debes seleccionar al menos una categoría.");
      return;
    }

    setModalCategorias(false);
    setSubiendo(true);

    try {
      const userId = await AsyncStorage.getItem('user_id');
      const formData = new FormData();
      formData.append('user_id', userId || '');
      if (cursoId) formData.append('curso_id', cursoId.toString());
      
      // 👈 Añadimos las categorías separadas por coma
      formData.append('categorias', catsSeleccionadas.join(',')); 
      
      if (Platform.OS === 'web') {
          // En la web, DocumentPicker nos da el archivo real en '.file'
          formData.append('file', archivoPendiente.file);
      } else {
          // En móviles (iOS/Android), el servidor necesita el objeto con la URI
          formData.append('file', {
              uri: archivoPendiente.uri,
              name: archivoPendiente.name,
              type: 'application/pdf',
          } as any);
      }
     await api.post(`/subir-apunte`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setArchivoPendiente(null);
      cargarApuntes();

    } catch (error) {
      Alert.alert("Error", "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
    }
  };

  const toggleCategoria = (cat: string) => {
      setCatsSeleccionadas(prev => 
          prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
      );
  };

  const confirmarBorrado = (id: number, nombre: string) => {
    // Si estamos en el navegador Web, usamos el alert nativo de Windows/Mac
    if (Platform.OS === 'web') {
        const seguro = window.confirm(`¿Seguro que quieres borrar "${nombre}"?`);
        if (seguro) {
            borrarApunte(id);
        }
    } else {
        // Si estamos en el móvil, usamos el Alert bonito de React Native
        Alert.alert(
          "Eliminar Apunte",
          `¿Seguro que quieres borrar "${nombre}"?`,
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Eliminar", style: "destructive", onPress: () => borrarApunte(id) }
          ]
        );
    }
  };

  const borrarApunte = async (id: number) => {
    try {
      // QUITAMOS el ${API_URL} de aquí
      await api.delete(`/apuntes/${id}`);
      setApuntes(listaActual => listaActual.filter(item => item.id !== id));
    } catch (error) {
      Alert.alert("Error", "No se pudo eliminar el apunte");
    }
  };


  const renderItem = ({ item }: { item: any }) => { 
    // Calculamos el texto seguro
    let categoriasTexto = "Sin categoría";
    
    if (item.categorias) {
      categoriasTexto = Array.isArray(item.categorias) 
          ? item.categorias.join(' • ') 
          : item.categorias.replace(/,/g, ' • '); 
    }
    
    // Devolvemos el JSX
    return (
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={[styles.iconContainer, { backgroundColor: isDark ? colors.background : '#eef6ff' }]}>
          <Ionicons name="document-text" size={32} color={colors.tint} />
        </View>
        
        <View style={styles.infoContainer}>
          <Text style={[styles.nombreArchivo, { color: colors.text }]} numberOfLines={1}>
              {item.nombre}
          </Text>
          <Text style={[styles.subtexto, { color: colors.subtext }]}>
              PDF • Listo para: {categoriasTexto}
          </Text>
        </View>
        
        <TouchableOpacity 
          onPress={() => confirmarBorrado(item.id, item.nombre)} 
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={24} color={colors.error} />
        </TouchableOpacity>
      </View>
    );
  };

  // RENDER PRINCIPAL DE LA PANTALLA
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* CABECERA */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={volver} style={{padding: 5}}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {cursoNombre}
          </Text>
          
          <View style={{width: 34}} />
      </View>
      
      {/* CONTENIDO PRINCIPAL */}
      <View style={{ flex: 1, padding: 20 }}>
          
          {loading ? (
            <ActivityIndicator size="large" color={colors.tint} style={{marginTop: 50}} />
          ) : apuntes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={80} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>Carpeta vacía</Text>
              <Text style={[styles.emptySubtext, { color: colors.subtext }]}>Sube el temario de este curso.</Text>
            </View>
          ) : (
            <FlatList
              data={apuntes}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderItem}
              contentContainerStyle={{ paddingBottom: 100 }}
            />
          )}

          {/* BOTÓN FLOTANTE (+) */}
          <TouchableOpacity 
            style={[styles.fab, { backgroundColor: colors.tint }, subiendo && { opacity: 0.7 }]} 
            onPress={elegirPDF}
            disabled={subiendo}
          >
            {subiendo ? (
              <ActivityIndicator color="white" />
            ) : (
              <Ionicons name="add" size={30} color="white" />
            )}
          </TouchableOpacity>

          {/* MODAL DE CATEGORÍAS */}
          <Modal visible={modalCategorias} transparent animationType="slide">
              <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20}}>
                  <View style={{backgroundColor: colors.card, padding: 20, borderRadius: 16}}>
                      <Text style={{fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 15}}>
                          ¿Para qué usarás este PDF?
                      </Text>
                      
                      {['Test Rapido', 'Examen Oficial', 'Modo Reto'].map(cat => (
                          <TouchableOpacity 
                              key={cat}
                              style={{
                                  flexDirection: 'row', alignItems: 'center', padding: 15, 
                                  borderWidth: 2, borderRadius: 12, marginBottom: 10,
                                  borderColor: catsSeleccionadas.includes(cat) ? colors.tint : colors.border
                              }}
                              onPress={() => toggleCategoria(cat)}
                          >
                              <Ionicons 
                                  name={catsSeleccionadas.includes(cat) ? "checkbox" : "square-outline"} 
                                  size={24} 
                                  color={catsSeleccionadas.includes(cat) ? colors.tint : colors.icon} 
                              />
                              <Text style={{marginLeft: 10, color: colors.text, fontSize: 16}}>{cat}</Text>
                          </TouchableOpacity>
                      ))}

                      <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 15}}>
                          <TouchableOpacity onPress={() => setModalCategorias(false)} style={{padding: 10}}>
                              <Text style={{color: colors.error, fontWeight: 'bold'}}>Cancelar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={confirmarSubida} style={{backgroundColor: colors.tint, padding: 10, borderRadius: 10, paddingHorizontal: 20}}>
                              <Text style={{color: 'white', fontWeight: 'bold'}}>Subir</Text>
                          </TouchableOpacity>
                      </View>
                  </View>
              </View>
          </Modal>
      </View>
    </View>
  );
}