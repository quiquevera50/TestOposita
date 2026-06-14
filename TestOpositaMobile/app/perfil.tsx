import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import api from './api';
import { API_URL } from './config'; 
// 👇 1. Importamos el Hook del Tema
import { useTheme } from '../context/ThemeContext';
import { useSafeBack } from '../hooks/useSafeBack';

export default function PerfilScreen() {
  const router = useRouter();
  const volver = useSafeBack('/(tabs)');
  
  //  2. Extraemos los colores y la función para cambiar modo
  const { colors, toggleTheme, isDark } = useTheme();

  const [username, setUsername] = useState('Cargando...');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    const storedId = await AsyncStorage.getItem('user_id');
    if (storedId) {
        setUserId(storedId);
        try {
            const res = await api.get(`/usuario`);
            setUsername(res.data.username);
            if (res.data.avatar) {
                setAvatarUrl(`${API_URL}/perfiles/${res.data.avatar}?time=${new Date().getTime()}`);
            }
        } catch (e) {
            console.log("Error cargando perfil");
        }
    }
  };
  
  const cerrarSesion = async () => {
    await AsyncStorage.clear();
    router.replace('/login');
  };

  const confirmarEliminarCuenta = () => {
    Alert.alert(
      "⚠ ELIMINAR CUENTA",
      "¿Estás seguro? Se borrarán todos tus datos.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, eliminar todo", style: "destructive", onPress: eliminarCuenta }
      ]
    );
  };

  const eliminarCuenta = async () => {
    if (!userId) return;
    try {
      await api.delete(`/eliminar-cuenta`);
      Alert.alert("Cuenta Eliminada", "Lamentamos verte partir.");
      await AsyncStorage.clear();
      router.replace('/login');
    } catch (error) {
      Alert.alert("Error", "No se pudo eliminar la cuenta.");
    }
  };

  const cambiarFoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
    });

    if (!result.canceled && userId) {
        setUploading(true);
        const asset = result.assets[0];
        const formData = new FormData();
        formData.append('user_id', userId);
        formData.append('file', {
            uri: asset.uri,
            name: 'foto.jpg',
            type: 'image/jpeg',
        } as any);

        try {
            const res = await api.post(`/subir-avatar`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setAvatarUrl(`${API_URL}/perfiles/${res.data.avatar_url}?time=${new Date().getTime()}`);
            Alert.alert("Genial", "Foto actualizada ✨");
        } catch (error) {
            Alert.alert("Error", "No se pudo subir la foto");
        } finally {
            setUploading(false);
        }
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* Botón Atrás */}
      <TouchableOpacity onPress={volver} style={styles.btnAtras}>
        <Ionicons name="arrow-back" size={28} color={colors.text} />
      </TouchableOpacity>

      <Text style={[styles.headerTitle, { color: colors.text }]}>Mi Perfil</Text>

      {/* Tarjeta de Usuario */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={cambiarFoto} style={styles.avatarContainer}>
            {uploading ? (
                <ActivityIndicator size="large" color={colors.tint} />
            ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                    <Ionicons name="person" size={50} color={colors.icon} />
                </View>
            )}
            <View style={[styles.editIcon, { borderColor: colors.card, backgroundColor: colors.tint }]}>
                <Ionicons name="camera" size={16} color="white" />
            </View>
        </TouchableOpacity>

        <Text style={[styles.username, { color: colors.text }]}>@{username}</Text>
        <Text style={[styles.label, { color: colors.subtext }]}>Opositor Constante</Text>
      </View>

      {/* 👇 NUEVO: Interruptor de Modo Oscuro */}
      <View style={[styles.optionRow, { backgroundColor: colors.card }]}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <Ionicons name={isDark ? "moon" : "sunny"} size={24} color={colors.text} />
            <Text style={[styles.optionText, { color: colors.text }]}>
                Modo {isDark ? "Oscuro" : "Claro"}
            </Text>
        </View>
        <Switch 
            value={isDark} 
            onValueChange={toggleTheme} 
            trackColor={{false: '#767577', true: colors.tint}}
            thumbColor={isDark ? "#fff" : "#f4f3f4"}
        />
      </View>
      
      {/* Botón Cerrar Sesión */}
      <TouchableOpacity 
        style={[styles.btnCerrar, { backgroundColor: colors.border }]} 
        onPress={cerrarSesion}
      >
        <Ionicons name="log-out-outline" size={24} color={colors.text} />
        <Text style={[styles.txtCerrar, { color: colors.text }]}>Cerrar Sesión</Text>
      </TouchableOpacity>

      {/* Botón Eliminar Cuenta */}
      <TouchableOpacity 
        style={[styles.btnEliminar, { borderColor: colors.error, backgroundColor: isDark ? 'transparent' : '#fee2e2' }]} 
        onPress={confirmarEliminarCuenta}
      >
        <Ionicons name="trash-bin-outline" size={24} color={colors.error} />
        <Text style={[styles.txtEliminar, { color: colors.error }]}>Eliminar mi cuenta</Text>
      </TouchableOpacity>
      
      <Text style={[styles.version, { color: colors.subtext }]}>TestOposita v1.0</Text>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingTop: 60, alignItems: 'center' },
  
  btnAtras: { position: 'absolute', top: 55, left: 20, zIndex: 10, padding: 5 },

  headerTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  card: { width: '100%', padding: 30, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, elevation: 3, marginBottom: 20 },
  
  avatarContainer: { position: 'relative', marginBottom: 15 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  editIcon: { position: 'absolute', bottom: 0, right: 0, padding: 8, borderRadius: 20, borderWidth: 3 },

  username: { fontSize: 22, fontWeight: 'bold' },
  label: { marginTop: 5 },

  // Estilo fila de opciones (Switch)
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 20, borderRadius: 12, marginBottom: 20 },
  optionText: { fontSize: 16, fontWeight: '600' },

  btnCerrar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 12, width: '100%', justifyContent: 'center', marginBottom: 15 },
  txtCerrar: { fontWeight: 'bold', fontSize: 16 },

  btnEliminar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 12, width: '100%', justifyContent: 'center', borderWidth: 1 },
  txtEliminar: { fontWeight: 'bold', fontSize: 16 },

  version: { marginTop: 30, fontSize: 12 }
});