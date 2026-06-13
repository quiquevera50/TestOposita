import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import api from './api';
import { API_URL } from './config';
import { useTheme } from '@/context/ThemeContext';



export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true); // Nuevo estado para evitar parpadeos
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    verificarSesionSegura();
  }, []);

  const verificarSesionSegura = async () => {
    try {
      // 1. Recuperamos lo que el móvil "recuerda"
      const storedId = await AsyncStorage.getItem('user_id');
      const storedUsername = await AsyncStorage.getItem('username');
      
      if (storedId && storedUsername) {
        // 2. Preguntamos al servidor quién es ese ID realmente
        const response = await api.get(`/usuario`);
        const serverUser = response.data;

        // 3. 🛑 PRUEBA DE SEGURIDAD: ¿Coinciden los nombres?
        // Si el servidor dice que el ID 1 es "Maria" pero el móvil recuerda "Pepe",
        // significa que la base de datos cambió. ¡EXPULSAR!
        if (serverUser.username === storedUsername) {
            router.replace('/(tabs)');
            return; // Importante parar aquí
        } else {
            console.log("⚠️ ALERTA DE SEGURIDAD: El ID existe pero el usuario no coincide.");
            throw new Error("Datos de sesión inconsistentes");
        }
      }
    } catch (error) {
      console.log("Sesión no válida o expirada. Limpiando credenciales...");
      await AsyncStorage.clear(); // Borramos todo rastro
    } finally {
      setCheckingSession(false); // Terminamos de comprobar
    }
  };

  const handleAuth = async () => {
    // 1. Comprobamos que no haya campos vacíos
    if (!username || !password) {
      Alert.alert("Faltan datos", "Por favor, escribe tu usuario y contraseña.");
      return;
    }

    // FILTRO DE CORREO ELECTRÓNICO 
    if (isRegistering) {
      if (!email) {
        Alert.alert("Faltan datos", "Por favor, escribe tu correo electrónico.");
        return;
      }
      // Esta fórmula matemática comprueba que el texto tenga forma de email
      const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!regexCorreo.test(email)) {
        Alert.alert("Correo inválido", "Por favor, introduce un correo electrónico real (ejemplo@correo.com).");
        return; // Cortamos la ejecución aquí, no se envía nada al servidor
      }
    }
    setLoading(true);
    const endpoint = isRegistering ? '/register' : '/login';

    try {
      const response = await api.post(`${endpoint}`, {
        username: username,
        password: password,
        email: email
      });

      if (isRegistering) {
        Alert.alert("¡Bienvenido!", "Cuenta creada. Ahora inicia sesión.");
        setIsRegistering(false);
      } else {
        const { token, user_id, avatar } = response.data;
        
        // 💾 GUARDAMOS CREDENCIALES COMPLETAS
        await AsyncStorage.multiSet([
            ['userToken', token],
            ['user_id', user_id.toString()],
            ['username', username], // <--- ESTO ES CLAVE PARA LA SEGURIDAD
            ['avatar', avatar || '']
        ]);
        
        router.replace('/(tabs)');
      }

    } catch (error: any) {
      const msg = error.response?.data?.detail || "Ha ocurrido un error de conexión";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  // Mientras comprobamos la sesión, mostramos una pantalla de carga blanca limpia
  if (checkingSession) {
      // 👇 Fondo dinámico durante la carga
      return (
          <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background}}>
              <ActivityIndicator size="large" color={colors.tint}/>
          </View>
      );
  }

  return (
    // 👇 3. Aplicamos colores dinámicos en los estilos en línea (array [])
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.logoContainer}>
          <Text style={{fontSize: 50}}>🦉</Text>
      </View>
      
      <Text style={[styles.title, { color: colors.text }]}>TestOposita</Text>
      <Text style={[styles.subtitle, { color: colors.subtext }]}>
        {isRegistering ? "Crea tu perfil de estudiante" : "Inicia sesión para continuar"}
      </Text>
      {isRegistering && (
        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: colors.text }]}>Correo Electrónico</Text>
          <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="ejemplo@correo.com"
              placeholderTextColor={colors.subtext}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
          />
        </View>
      )}
      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: colors.text }]}>Usuario</Text>
        <TextInput
            // 👇 Inputs adaptados al tema
            style={[styles.input, { 
                backgroundColor: colors.inputBg, 
                color: colors.text, 
                borderColor: colors.border 
            }]}
            placeholder="Ej: opositor_guerrero"
            placeholderTextColor={colors.subtext} // Color del texto de ayuda
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
        />
      </View>
      
      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: colors.text }]}>Contraseña</Text>
        <TextInput
            style={[styles.input, { 
                backgroundColor: colors.inputBg, 
                color: colors.text, 
                borderColor: colors.border 
            }]}
            placeholder="Introduce tu contraseña"
            placeholderTextColor={colors.subtext}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
        />
      </View>

      <TouchableOpacity 
        style={[styles.btnPrimary, { backgroundColor: colors.tint }]} 
        onPress={handleAuth} 
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="white" /> : (
            <Text style={styles.btnText}>{isRegistering ? "Crear Cuenta" : "Entrar"}</Text>
        )}
      </TouchableOpacity>
       {/* 🛑 MODO BETA: BOTÓN DE REGISTRO OCULTO TEMPORALMENTE 🛑
      <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)} style={styles.switchContainer}>
        <Text style={[styles.switchText, { color: colors.tint }]}>
            {isRegistering ? "¿Ya tienes cuenta? Inicia sesión" : "¿Eres nuevo? Regístrate aquí"}
        </Text>
      </TouchableOpacity>
      */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 30, backgroundColor: '#ffffff' },
  logoContainer: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#111', textAlign: 'center', marginBottom: 5 },
  subtitle: { fontSize: 16, color: 'gray', textAlign: 'center', marginBottom: 40 },
  inputContainer: { marginBottom: 15 },
  label: { fontWeight: 'bold', color: '#333', marginBottom: 5, marginLeft: 5 },
  input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#eee', fontSize: 16 },
  btnPrimary: { backgroundColor: '#007AFF', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10, shadowColor: '#007AFF', shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  switchContainer: { marginTop: 25, alignItems: 'center' },
  switchText: { color: '#007AFF', fontWeight: '600' }
});