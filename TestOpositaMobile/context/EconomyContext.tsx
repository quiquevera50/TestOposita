import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import api from '../app/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==========================================
// 💎 CONTEXTO DE ECONOMÍA UNIFICADO
// Fuente única de verdad: vidas ❤️, rubíes 💎, racha 🔥, estrellas ⭐, XP ✨
// ==========================================

interface Economia {
    vidas: number;
    vidasMax: number;
    segundosRestantes: number;
    rubies: number;
    rachaDias: number;
    estrellasTotales: number;
    xp: number;
    nivel: number;
    xpSiguiente: number;
}

interface EconomyContextProps extends Economia {
    cargando: boolean;
    fetchEconomia: () => Promise<void>;
    consumirVida: () => Promise<boolean>;
    ganarRubies: (cantidad: number) => Promise<number>;
    gastarRubies: (cantidad: number) => Promise<boolean>;
    registrarActividad: () => Promise<{ racha_dias: number; incrementada: boolean } | null>;
    guardarEstrellas: (retoId: number, numeroNivel: number, estrellas: number) => Promise<{ rubies_ganados: number } | null>;
}

const ESTADO_INICIAL: Economia = {
    vidas: 5, vidasMax: 5, segundosRestantes: 0,
    rubies: 0, rachaDias: 0, estrellasTotales: 0,
    xp: 0, nivel: 1, xpSiguiente: 120,
};

const EconomyContext = createContext<EconomyContextProps>({} as EconomyContextProps);

export const EconomyProvider = ({ children }: { children: ReactNode }) => {
    const [eco, setEco] = useState<Economia>(ESTADO_INICIAL);
    const [cargando, setCargando] = useState(true);

    // 1. Lectura única de TODA la economía
    const fetchEconomia = async () => {
        try {
            const userId = await AsyncStorage.getItem('user_id');
            if (!userId) return;
            const res = await api.get('/economia');
            const d = res.data;
            setEco({
                vidas: d.vidas,
                vidasMax: d.vidas_max,
                segundosRestantes: d.segundos_restantes,
                rubies: d.rubies,
                rachaDias: d.racha_dias,
                estrellasTotales: d.estrellas_totales,
                xp: d.xp,
                nivel: d.nivel,
                xpSiguiente: d.xp_siguiente,
            });
        } catch (error) {
            console.log('Error sincronizando economía', error);
        } finally {
            setCargando(false);
        }
    };

    // 2. Gastar una vida (al fallar / al jugar)
    const consumirVida = async (): Promise<boolean> => {
        try {
            const res = await api.post('/consumir-energia');
            setEco(prev => ({
                ...prev,
                vidas: res.data.energia_restante,
                segundosRestantes: res.data.energia_restante === prev.vidasMax - 1 ? 3600 : prev.segundosRestantes,
            }));
            return true;
        } catch {
            return false;
        }
    };

    // 3. Ganar rubíes
    const ganarRubies = async (cantidad: number): Promise<number> => {
        try {
            const res = await api.post(`/ganar-rubies/${cantidad}`);
            setEco(prev => ({ ...prev, rubies: res.data.rubies }));
            return res.data.rubies;
        } catch {
            return eco.rubies;
        }
    };

    // 4. Gastar rubíes (devuelve false si no hay suficientes)
    const gastarRubies = async (cantidad: number): Promise<boolean> => {
        try {
            const res = await api.post(`/gastar-rubies/${cantidad}`);
            setEco(prev => ({ ...prev, rubies: res.data.rubies }));
            return true;
        } catch {
            return false;
        }
    };

    // 5. Registrar actividad diaria (racha)
    const registrarActividad = async () => {
        try {
            const res = await api.post('/registrar-actividad');
            setEco(prev => ({ ...prev, rachaDias: res.data.racha_dias }));
            return res.data;
        } catch {
            return null;
        }
    };

    // 6. Guardar estrellas de un nivel
    const guardarEstrellas = async (retoId: number, numeroNivel: number, estrellas: number) => {
        try {
            const res = await api.post(`/guardar-estrellas/${retoId}/${numeroNivel}/${estrellas}`);
            if (res.data.rubies_ganados > 0) {
                setEco(prev => ({ ...prev, rubies: prev.rubies + res.data.rubies_ganados }));
            }
            fetchEconomia(); // refrescar estrellas totales
            return res.data;
        } catch {
            return null;
        }
    };

    // Carga inicial
    useEffect(() => { fetchEconomia(); }, []);

    // ⏱️ Reloj maestro de recarga de vidas
    useEffect(() => {
        if (eco.segundosRestantes <= 0) return;
        const interval = setInterval(() => {
            setEco(prev => {
                if (prev.segundosRestantes <= 1) {
                    fetchEconomia();
                    return { ...prev, segundosRestantes: 0 };
                }
                return { ...prev, segundosRestantes: prev.segundosRestantes - 1 };
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [eco.segundosRestantes]);

    return (
        <EconomyContext.Provider value={{
            ...eco, cargando,
            fetchEconomia, consumirVida, ganarRubies, gastarRubies,
            registrarActividad, guardarEstrellas,
        }}>
            {children}
        </EconomyContext.Provider>
    );
};

export const useEconomy = () => useContext(EconomyContext);
