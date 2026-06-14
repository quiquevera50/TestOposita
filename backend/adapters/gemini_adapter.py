from dotenv import load_dotenv
from google import genai
from google.genai import types
import os
import json
import asyncio
import tempfile
import requests
import time

from adapters.llm_factory import LLMAdapter

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("❌ ERROR: No se encontró GEMINI_API_KEY en el archivo .env")

client = genai.Client(api_key=API_KEY)

class GeminiAdapter(LLMAdapter):
    def __init__(self):
        self.modelos_disponibles = [
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
        ]
        print(f"[GEMINI ADAPTER] Iniciado con google-genai SDK. {len(self.modelos_disponibles)} modelos.")

    def _subir_a_gemini(self, path_or_url: str):
        tmp_path = None
        if path_or_url.startswith("http"):
            print("📥 Gemini: Descargando PDF de Supabase...")
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                response = requests.get(path_or_url)
                response.raise_for_status()
                tmp.write(response.content)
                tmp_path = tmp.name
            ruta_a_subir = tmp_path
        else:
            ruta_a_subir = path_or_url

        try:
            print("   ⬆️ Subiendo PDF a Gemini Files API...")
            with open(ruta_a_subir, "rb") as f:
                uploaded_file = client.files.upload(
                    file=f,
                    config=types.UploadFileConfig(mime_type="application/pdf")
                )
            # Esperar procesamiento
            while uploaded_file.state and uploaded_file.state.name == "PROCESSING":
                print("   ⏳ Google procesando...")
                time.sleep(2)
                uploaded_file = client.files.get(name=uploaded_file.name)
            print("   ✅ PDF listo en Gemini")
            return uploaded_file
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

    async def _intentar_generar(self, prompt, uploaded_file):
        errores = []
        for nombre_modelo in self.modelos_disponibles:
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=nombre_modelo,
                    contents=[uploaded_file, prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json"
                    )
                )
                return json.loads(response.text)
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg:
                    errores.append(f"{nombre_modelo}: CUOTA AGOTADA")
                else:
                    errores.append(f"{nombre_modelo}: {error_msg[:80]}")
                continue

        print(f"❌ ERROR CRÍTICO: Ningún modelo pudo procesar. Errores: {errores}")
        return []

    async def _intentar_texto(self, prompt, uploaded_file):
        """Genera TEXTO plano (Markdown), no JSON. Para resúmenes."""
        for nombre_modelo in self.modelos_disponibles:
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=nombre_modelo,
                    contents=[uploaded_file, prompt],
                )
                if response.text:
                    return response.text
            except Exception as e:
                print(f"⚠️ {nombre_modelo}: {str(e)[:80]}")
                continue
        return None

    async def generar_resumen(self, file_obj, modo="esquema"):
        """Genera un resumen del PDF en dos formatos: 'esquema' o 'completo'."""
        print(f"🧠 IA: Generando resumen ({modo})...")
        try:
            uploaded_file = self._subir_a_gemini(file_obj.path)
        except Exception as e:
            print(f"❌ ERROR resumen: {e}")
            return None

        if modo == "completo":
            prompt = """
            Eres un profesor experto. Lee el documento PDF y escribe un RESUMEN EXPLICATIVO
            y fluido, como si se lo explicaras a un estudiante que se prepara una oposición.

            REGLAS:
            - Escribe en español, claro y didáctico.
            - Usa formato Markdown: títulos con ##, subtítulos con ###, **negrita** en los conceptos clave.
            - Estructura por temas/apartados siguiendo el documento.
            - Explica las ideas, no te limites a listarlas.
            - No inventes nada que no esté en el documento.
            - Empieza directamente con el contenido (sin "Aquí tienes el resumen").
            """
        else:  # esquema
            prompt = """
            Eres un experto en técnicas de estudio. Lee el documento PDF y crea un ESQUEMA
            DE ESTUDIO claro y jerárquico, ideal para memorizar y repasar.

            REGLAS:
            - Escribe en español.
            - Usa formato Markdown: títulos con ##, subtítulos con ###.
            - Usa listas con - y sub-listas indentadas.
            - Pon en **negrita** los conceptos, fechas, nombres y datos clave que hay que memorizar.
            - Sé conciso: puntos clave, no párrafos largos.
            - No inventes nada que no esté en el documento.
            - Empieza directamente con el contenido (sin "Aquí tienes el esquema").
            """
        return await self._intentar_texto(prompt, uploaded_file)

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
        Schema JSON esperado: ["Introducción", "Tema 1", "Tema 2", ...]
        """
        return await self._intentar_generar(prompt, uploaded_file)

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

        SCHEMA JSON OBLIGATORIO:
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

    async def generar_test_biblioteca(self, file_obj, cantidad=10):
        es_todo = (cantidad is None or cantidad <= 0)
        print(f"🧠 IA: Generando test {'COMPLETO (todo el PDF)' if es_todo else f'de {cantidad} preguntas'}...")
        try:
            uploaded_file = self._subir_a_gemini(file_obj.path)
        except Exception as e:
            print(f"❌ ERROR CRÍTICO GEMINI: {e}")
            return []

        if es_todo:
            prompt = """
            Genera un test que cubra TODO el contenido evaluable del documento PDF adjunto.

            REGLAS CRÍTICAS (OBLIGATORIAS):
            1. Crea tantas preguntas como el contenido permita de forma NATURAL: una por cada concepto, dato,
               fecha, nombre o idea importante que aparezca en el documento.
            2. La cantidad debe AJUSTARSE AL CONTENIDO REAL. Si el temario da para 18 preguntas de calidad,
               genera 18; si da para 55, genera 55. No hay número fijo.
            3. PROHIBIDO INVENTAR: no añadas información, datos ni preguntas que no estén respaldados por el documento.
            4. PROHIBIDO RELLENAR: no repitas preguntas ni metas preguntas triviales solo para alcanzar un número.
            5. Cubre TODOS los apartados/temas del documento, de principio a fin.
            6. Formato JSON estricto.

            SALIDA OBLIGATORIA (Array de objetos, tantos como exija el contenido):
            [
              {
                "Pregunta": "¿Enunciado...?",
                "Opciones": ["A", "B", "C", "D"],
                "Indice_correcta": 0,
                "Explicacion": "Justificación breve."
              }
            ]
            """
        else:
            prompt = f"""
            Genera un test de EXACTAMENTE {cantidad} preguntas tipo test basadas en el documento PDF adjunto.

            REGLAS CRÍTICAS:
            1. Genera {cantidad} objetos JSON, seleccionando los conceptos MÁS IMPORTANTES del documento.
            2. PROHIBIDO INVENTAR información que no esté en el documento.
            3. PROHIBIDO RELLENAR con preguntas triviales o repetidas. Si el documento no da para {cantidad}
               preguntas de calidad, genera solo las que el contenido permita de verdad.
            4. Formato JSON estricto.

            SALIDA OBLIGATORIA (Array de objetos):
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

    async def analizar_pdf_examen_real(self, file_obj):
        print(f"🧠 IA: Analizando si el PDF es un examen apto...")
        try:
            uploaded_file = self._subir_a_gemini(file_obj.path)
        except Exception as e:
            print(f"Error subiendo archivo a Gemini: {e}")
            return {"apto": False, "motivo": "Error al procesar el archivo PDF."}

        prompt = """
        Eres un sistema avanzado de extracción de datos. Tu misión es analizar el documento PDF adjunto.

        REGLAS DE APTITUD:
        1. Si encuentras AL MENOS UNA pregunta tipo test, el documento DEBE SER APTO ("apto": true).

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
