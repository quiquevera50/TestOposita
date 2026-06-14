import { useRouter, type Href } from 'expo-router';

/**
 * Botón "volver" robusto.
 * Si hay pantalla anterior en la pila, vuelve. Si no (p. ej. tras recargar la
 * web en una pantalla profunda), navega a un destino de reserva seguro.
 */
export function useSafeBack(fallback: Href = '/(tabs)') {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  };
}
