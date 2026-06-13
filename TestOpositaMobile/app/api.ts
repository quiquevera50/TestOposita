import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router'; // 👈 Añadimos el router global
import { API_URL } from './config';

// Creamos una versión personalizada de axios
const api = axios.create({
  baseURL: API_URL,
  headers: {
    // ESTA ES LA LÍNEA MÁGICA QUE SOLUCIONA EL ERROR 405 DE NGROK 
    'ngrok-skip-browser-warning': 'true'
  }
});

// 1. "Interceptor" de Petición (Salida): Pega el token a cada solicitud
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 👇 2. NUEVO: "Interceptor" de Respuesta (Entrada): Caza los 401 globalmente
api.interceptors.response.use(
  (response) => {
    // Si la respuesta es exitosa (2xx), la dejamos pasar tranquilamente
    return response;
  },
  async (error) => {
    // Verificamos si el error es exactamente un 401 (No autorizado)
    if (error.response && error.response.status === 401) {
      console.log("🛡️ [Guardián API] Token inválido o caducado detectado. Limpiando sesión...");

      try {
        // 1. Rompemos la sesión local (borramos token, id, etc.)
        await AsyncStorage.clear();

        // 2. Redirigimos al usuario a la pantalla de Login.
        // Usamos setTimeout para no interrumpir ciclos de renderizado activos en React.
        setTimeout(() => {
          router.replace('/login');
        }, 100);

      } catch (clearError) {
        console.error("Error limpiando AsyncStorage durante el 401:", clearError);
      }
    }

    // Pase lo que pase, devolvemos el error para que (si queremos) 
    // la pantalla específica pueda leerlo y mostrar un cartelito.
    return Promise.reject(error);
  }
);

export default api;