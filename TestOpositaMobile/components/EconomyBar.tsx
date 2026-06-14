import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEconomy } from '../context/EconomyContext';
import { useTheme } from '../context/ThemeContext';

// ==========================================
// 💎 BARRA DE ECONOMÍA — fila de monedas estilo Duolingo
// ❤️ vidas   💎 rubíes   🔥 racha   ⭐ estrellas
// ==========================================

const COLORS = {
    vidas: '#FF4B4B',
    rubies: '#FF3B6B',
    racha: '#FF9600',
    estrellas: '#FFC800',
};

function formatTime(seg: number) {
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
    onPressVidas?: () => void;
    onPressRubies?: () => void;
}

function Pill({ icon, color, value, sub, onPress, bg, border }: any) {
    const Container: any = onPress ? TouchableOpacity : View;
    return (
        <Container
            onPress={onPress}
            activeOpacity={0.7}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: bg,
                borderWidth: 1,
                borderColor: border,
                borderRadius: 14,
                paddingVertical: 7,
                paddingHorizontal: 11,
                gap: 6,
                flex: 1,
                justifyContent: 'center',
            }}
        >
            <Ionicons name={icon} size={18} color={color} />
            <View>
                <Text style={{ color, fontWeight: '800', fontSize: 15, lineHeight: 17 }}>{value}</Text>
                {sub ? <Text style={{ color: color, opacity: 0.7, fontSize: 9, lineHeight: 10 }}>{sub}</Text> : null}
            </View>
        </Container>
    );
}

export function EconomyBar({ onPressVidas, onPressRubies }: Props) {
    const { vidas, vidasMax, segundosRestantes, rubies, rachaDias, estrellasTotales } = useEconomy();
    const { isDark } = useTheme();

    const bg = isDark ? '#1E293B' : '#FFFFFF';
    const border = isDark ? '#334155' : '#EBEBF0';

    return (
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
            <Pill
                icon="flame"
                color={COLORS.racha}
                value={rachaDias}
                sub={rachaDias === 1 ? 'día' : 'días'}
                bg={bg}
                border={border}
            />
            <Pill
                icon="star"
                color={COLORS.estrellas}
                value={estrellasTotales}
                bg={bg}
                border={border}
            />
            <Pill
                icon="diamond"
                color={COLORS.rubies}
                value={rubies}
                bg={bg}
                border={border}
                onPress={onPressRubies}
            />
            <Pill
                icon="heart"
                color={COLORS.vidas}
                value={`${vidas}/${vidasMax}`}
                sub={vidas < vidasMax && segundosRestantes > 0 ? formatTime(segundosRestantes) : undefined}
                bg={bg}
                border={border}
                onPress={onPressVidas}
            />
        </View>
    );
}
