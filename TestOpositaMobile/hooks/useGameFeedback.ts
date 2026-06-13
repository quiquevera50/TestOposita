import * as Haptics from 'expo-haptics';
import { Vibration, Platform } from 'react-native'; // 👈 Importamos la vibración "de toda la vida"
import { Audio } from 'expo-av';
import { useState, useEffect } from 'react';

export const useGameFeedback = () => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // 1. EFECTO DE ACIERTO ✅ (Doble toque rápido y fuerte)
  const feedbackAcierto = async () => {
    if (Platform.OS === 'ios') {
        // En iPhone el "Success" suele notarse bien, pero forzamos Heavy por si acaso
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
        // En Android hacemos un patrón manual: vibra 50ms, espera 50ms, vibra 50ms
        Vibration.vibrate([0, 50, 50, 50]); 
    }
  };

  // 2. EFECTO DE ERROR ❌ (Vibración larga y pesada)
  const feedbackError = async () => {
    // Esto hace BZZZZZZ (400 milisegundos). Imposible no notarlo.
    Vibration.vibrate(400); 
  };

  // 3. EFECTO DE SELECCIÓN 👆 (Toque seco)
  const feedbackSeleccion = () => {
    // Cambiamos 'Light' (suave) por 'Heavy' (fuerte) o 'Medium'
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // --- Lógica Interna de Sonido (Preparada para el futuro) ---
  const playSound = async (file: any) => {
    try {
      const { sound } = await Audio.Sound.createAsync(file);
      setSound(sound);
      await sound.playAsync();
    } catch (error) {
      console.log("Error reproduciendo sonido", error);
    }
  };

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  return { feedbackAcierto, feedbackError, feedbackSeleccion };
};