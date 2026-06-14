import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Dimensions } from 'react-native';

// ==========================================
// 🎉 CONFETI ligero (sin librerías). Se dispara al montar.
// ==========================================

const COLORS = ['#58CC02', '#1CB0F6', '#FFC800', '#FF4B4B', '#CE82FF', '#FF9600'];
const { width } = Dimensions.get('window');

function Pieza({ delay, x, color }: { delay: number; x: number; color: string }) {
  const caer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(caer, {
      toValue: 1,
      duration: 1600 + Math.random() * 900,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);
  const translateY = caer.interpolate({ inputRange: [0, 1], outputRange: [-40, 620] });
  const rotate = caer.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + Math.random() * 360}deg`] });
  const opacity = caer.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.View
      style={{
        position: 'absolute', left: x, top: 0,
        width: 9, height: 14, borderRadius: 2, backgroundColor: color,
        transform: [{ translateY }, { rotate }], opacity,
      }}
    />
  );
}

export function Confetti({ count = 40 }: { count?: number }) {
  const piezas = useRef(
    Array.from({ length: count }).map((_, i) => ({
      id: i,
      delay: Math.random() * 600,
      x: Math.random() * width,
      color: COLORS[i % COLORS.length],
    }))
  ).current;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }}>
      {piezas.map(p => <Pieza key={p.id} delay={p.delay} x={p.x} color={p.color} />)}
    </View>
  );
}
