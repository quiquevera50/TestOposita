from dotenv import load_dotenv
import google.generativeai as genai
from google.generativeai.types import GenerationConfig
import os
import json
import asyncio
import tempfile
import requests
import time

from adapters.llm_factory import LLMAdapter

# Configuración inicial
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("❌ ERROR: No se encontró GEMINI_API_KEY en el archivo .env")

genai.configure(api_key=API_KEY)

class GeminiAdapter(LLMAdapter):
    def __init__(self):
        # 📋 LISTA DE MODELOS ACTUALIZADA
        self.modelos_disponibles = [
            "gemini-2.5-flash",          # 🚀 PRIORIDAD 1: El nuevo estándar de velocidad/calidad
            "gemini-2.5-pro",            # 🧠 PRIORIDAD 2: El más inteligente
            "gemini-2.0-flash",          # 🛡️ PRIORIDAD 3: El caballo de batalla fiable
            "gemini-2.5-flash-lite",     # ⚡ PRIORIDAD 4: Versión ligera nueva
            "gemini-2.0-flash-lite",     # ⚡ PRIORIDAD 5: Versión ligera anterior
            "gemini-flash-latest",       # 🔄 Fallback: Última versión Flash estable
            "gemini-pro-latest",         # 🔄 Fallback: Última versión Pro estable
            "gemini-2.0-flash-exp"       # 🧪 Experimental: Por si todo lo demás falla
        ]
        print(f"[GEMINI ADAPTER] Iniciado. Sistema multi-modelo cargado ({len(self.modelos_disponibles)} modelos).")

    # 👇 FUNCIÓN UNIFICADA: DESCARGAR (SI ES URL), SUBIR A GOOGLE Y BORRAR
    def _subir_a_gemini(self, path_or_url: str):
        tmp_path = None
        
        # 1. Si la ruta empieza por http, descargamos temporalmente
        if path_or_url.startswith("http"):
            print("📥 Gemini: Descargando PDF de Supabase...")
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                response = requests.get(path_or_url)
                response.raise_for_status()
                tmp.write(response.content)
                tmp_path = tmp.name
            ruta_a_subir = tmp_path
        else:
            # Si es local (mis_apuntes/...), lo usamos tal cual
            ruta_a_subir = path_or_url

        try:
            # 2. Subimos a Google
            print("   ⬆️ Subiendo PDF a Gemini...")
            uploaded_file = genai.upload_file(ruta_a_subir, mime_type="application/pdf")
            
            # 3. Esperamos a que Google procese internamente (Crítico para archivos grandes)
            while uploaded_file.state.name == "PROCESSING":
                print("   ⏳ Google procesando...")
                time.sleep(2)
                uploaded_file = genai.get_file(uploaded_file.name)
                
            return uploaded_file
            
        finally:
            # 4. Limpieza: Borramos el archivo temporal
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
                print("🧹 Gemini: PDF temporal borrado del servidor.")

    async def _intentar_generar(self, prompt, uploaded_file):
        """ Prueba modelos con CONFIGURACIÓN DE JSON NATIVO """
        errores = []
        config_json = GenerationConfig(response_mime_type="application/json")
        
        for nombre_modelo in self.modelos_disponibles:
            try:
                model = genai.GenerativeModel(nombre_modelo)
                response = await asyncio.to_thread(
                    model.generate_content,
                    [prompt, uploaded_file],
                    generation_config=config_json
                )
                return json.loads(response.text)
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg: errores.append(f"{nombre_modelo}: CUOTA AGOTADA")
                elif "json" in error_msg.lower(): errores.append(f"{nombre_modelo}: JSON MAL FORMADO")
                else: errores.append(f"{nombre_modelo}: Error genérico")
                continue
               
        print(f"❌ ERROR CRÍTICO: Ningún modelo pudo procesar la solicitud. Errores: {errores}")
        return []

    # =========================================================================
    # 1. MODO RETO: ESTRUCTURA (MAPA)
    # =========================================================================
    async def generar_mapa_retos(self, file_obj):
        print("🧠 IA: Escaneando PDF para crear mapa de niveles...")
        try:
            uploaded_file = self._subir_a_gemini(file_obj.path)
        except Exception as e:
            print(f"Error gestionando archivo en Gemini: {e}")
            return []

        prompt = """
        Actúa como un planificador de estudios. Analiza el PDF.
        Identifica entre 4 y 8 temas principales para crear un curso por tema identificado.
        Devuelve SOLO un Array JSON de strings con los títulos.
        
        Schema JSON esperado:
        ["Introducción", "Tema 1", "Tema 2", ...]
        """
        return await self._intentar_generar(prompt, uploaded_file)

    # ======================================================================#
    # 2. MODO RETO: GENERAR NIVEL EN 3 FASES                                #
    # ======================================================================#
    async def generar_nivel_reto(self, file_obj, tema_nivel, dificultad="medio"):
        print(f"🧠 IA: Creando 3 fases de dominio para: {tema_nivel}...")
        try:
            uploaded_file = self._subir_a_gemini(file_obj.path)
        except Exception as e:
            print(f"Error subiendo archivo a Gemini: {e}")
            return {}

        prompt = f"""
        Eres un profesor experto diseñando un sistema de aprendizaje escalonado basado en el PDF adjunto.
        Tema principal a evaluar: "{tema_nivel}".
        
        Tu misión es crear un Nivel compuesto por 3 Fases de dificultad creciente.
        Para CADA FASE debes generar EXACTAMENTE 10 ejercicios con esta distribución:
        - 4 preguntas de "tipo_test" (4 opciones).
        - 3 preguntas de "verdadero_falso" (2 opciones).
        - 3 preguntas de "huecos" (Frase con '_____', 3 opciones).

        ESCALA DE DIFICULTAD:
        - fase_1 (Calentamiento): Conceptos muy básicos, directos y fáciles de identificar.
        - fase_2 (Consolidación): Nivel medio. Requiere aplicar conceptos o relacionar ideas.
        - fase_3 (Dominio): Nivel difícil. Detalles precisos, excepciones, fechas, o casos complejos.

        IMPORTANTE:
        - El campo "respuesta_correcta" debe ser SIEMPRE el ÍNDICE numérico (0, 1, 2...) de la opción correcta.
        - NUNCA pidas escribir texto libre.

        SCHEMA JSON OBLIGATORIO (Devuelve EXACTAMENTE esta estructura):
        {{
            "fase_1": [
                {{ "tipo": "test", "pregunta": "...", "opciones": ["A", "B", "C", "D"], "respuesta_correcta": 0, "explicacion": "..." }}
            ],
            "fase_2": [
                {{ "tipo": "verdadero_falso", "pregunta": "...", "opciones": ["Verdadero", "Falso"], "respuesta_correcta": 1, "explicacion": "..." }}
            ],
            "fase_3": [
                {{ "tipo": "huecos", "pregunta": "El _____ es azul.", "opciones": ["Cielo", "Suelo", "Mar"], "respuesta_correcta": 0, "explicacion": "..." }}
            ]
        }}
        """
        return await self._intentar_generar(prompt, uploaded_file) 
        
    # =========================================================================
    # 3. TEST RÁPIDO (VARIABLE 10-30 PREGUNTAS)
    # =========================================================================
    async def generar_test_biblioteca(self, file_obj, cantidad=10):
        print(f"🧠 IA: Generando test rápido de {cantidad} preguntas...")
        try:
            uploaded_file = self._subir_a_gemini(file_obj.path)
        except Exception as e:
            print(f"❌ ERROR CRÍTICO GEMINI: {e}")
            return []

        prompt = f"""
        Genera un test EXHAUSTIVO de EXACTAMENTE {cantidad} preguntas tipo test basadas en el documento PDF adjunto.
        
        REGLAS CRÍTICAS:
        1. Debes generar {cantidad} objetos JSON. Ni uno menos.
        2. Formato JSON estricto.

        SALIDA OBLIGATORIA (Array de {cantidad} objetos):
        [
          {{
            "Pregunta": "¿Enunciado...?",
            "Opciones": ["A", "B", "C", "D"],
            "Indice_correcta": 0,
            "Explicacion": "Justificación breve."
          }}
        ]
        """
        return await self._intentar_generar(prompt, uploaded_file)       
    
    # =========================================================================
    # 4. ANALIZADOR DE EXÁMENES OFICIALES
    # =========================================================================
    async def analizar_pdf_examen_real(self, file_obj):
        print(f"🧠 IA: Analizando si el PDF es un examen apto...")
        try:
            uploaded_file = self._subir_a_gemini(file_obj.path)
        except Exception as e:
            print(f"Error subiendo archivo a Gemini: {e}")
            return {"apto": False, "motivo": "Error al procesar el archivo PDF."}

        prompt = """
        Eres un sistema avanzado de extracción de datos. Tu misión es analizar el documento PDF adjunto.
        
        REGLAS DE APTITUD (¡CRÍTICO!):
        1. Muchos exámenes oficiales tienen portadas, páginas de instrucciones o temarios al principio. NO RECHACES el documento por eso.
        2. Si encuentras AL MENOS UNA pregunta tipo test, el documento DEBE SER APTO ("apto": true).

        REGLAS DE EXTRACCIÓN Y RAZONAMIENTO:
        1. Extrae fielmente todas las preguntas tipo test que encuentres. 
        2. Adivina la respuesta correcta si no está explícitamente marcada.
        3. MUY IMPORTANTE: Como los exámenes oficiales no suelen traer explicaciones, DEBES generar tú mismo una breve (2-3 líneas) y clara justificación ("Explicacion") para cada respuesta correcta que extraigas.

        SCHEMA JSON OBLIGATORIO:
        {
            "apto": true,
            "motivo": "",
            "preguntas": [
                {
                    "Pregunta": "Texto de la pregunta...",
                    "Opciones": ["A", "B", "C", "D"],
                    "Indice_correcta": 0,
                    "Explicacion": "Justificación generada por ti razonando la respuesta."
                }
            ]
        }
        """
        return await self._intentar_generar(prompt, uploaded_file)