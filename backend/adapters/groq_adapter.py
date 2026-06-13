import os
import json
import PyPDF2
import io
import requests
from dotenv import load_dotenv
from groq import AsyncGroq

from adapters.llm_factory import LLMAdapter

load_dotenv()
API_KEY = os.getenv("GROQ_API_KEY")

if not API_KEY:
    raise ValueError("❌ ERROR: No se encontró GROQ_API_KEY en el archivo .env")


class GroqAdapter(LLMAdapter):
    def __init__(self):
        if not API_KEY:
            print("⚠️ ADVERTENCIA: GROQ_API_KEY no encontrada en config.py")
        
        self.client = AsyncGroq(api_key=API_KEY)
        self.modelos_disponibles = [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768"
        ]
        print(f"[GROQ ADAPTER] Iniciado. Modelos cargados: {len(self.modelos_disponibles)}")

    def _extraer_texto_pdf(self, pdf_path: str) -> str:
        texto = ""
        try:
            # 👇 LA MAGIA: Si es una URL de Supabase, lo lee de internet a la memoria
            if pdf_path.startswith("http"):
                print("📥 Groq: Descargando PDF de Supabase a la memoria...")
                response = requests.get(pdf_path)
                response.raise_for_status()
                pdf_file = io.BytesIO(response.content)
            else:
                # Si es un archivo local (pruebas), lo abre normal
                pdf_file = open(pdf_path, "rb")

            reader = PyPDF2.PdfReader(pdf_file)
            for page in reader.pages:
                text = page.extract_text()
                if text: texto += text + "\n"
                
            # Cerramos el archivo solo si lo abrimos del disco duro
            if not isinstance(pdf_file, io.BytesIO):
                pdf_file.close()

        except Exception as e:
            print(f"❌ Error leyendo PDF en Groq Adapter: {e}")
        return texto[:30000] # Limite para Groq

    async def _intentar_generar(self, prompt_sistema: str, prompt_usuario: str):
        errores = []
        for modelo in self.modelos_disponibles:
            try:
                response = await self.client.chat.completions.create(
                    model=modelo,
                    messages=[
                        {"role": "system", "content": prompt_sistema},
                        {"role": "user", "content": prompt_usuario}
                    ],
                    response_format={"type": "json_object"}, 
                    temperature=0.2
                )
                return json.loads(response.choices[0].message.content)
            except Exception as e:
                errores.append(f"{modelo}: {str(e)}")
                continue
        print(f"❌ GROQ CRÍTICO: Ningún modelo pudo responder. Errores: {errores}")
        return None

    # =========================================================================
    # 1. MODO RETO: ESTRUCTURA (MAPA)
    # =========================================================================
    async def generar_mapa_retos(self, file_obj) -> list:
        print("🧠 GROQ: Escaneando PDF para mapa de niveles...")
        texto_pdf = self._extraer_texto_pdf(file_obj.path)
        
        prompt_sys = """
        Actúa como un planificador de estudios experto. Analiza el texto proporcionado.
        Tu ÚNICA tarea es identificar entre 4 y 8 temas principales para crear un curso por tema identificado.
         Devuelve SOLO un Array JSON de strings con los títulos.
        No incluyas texto fuera del JSON.
        """
        
        prompt_usr = f"""
        Extrae los temas principales de este documento.
        
        FORMATO JSON ESPERADO:
        {{
            "mapa": ["Introducción", "Tema 1", "Tema 2", ...]
        }}
        
        TEXTO DEL DOCUMENTO:
        {texto_pdf[:15000]}
        """
        
        res = await self._intentar_generar(prompt_sys, prompt_usr)
        return res.get("mapa", []) if res else []
    
   # =========================================================================
    # 2. MODO RETO: GENERAR NIVEL EN 3 FASES (ESTILO DUOLINGO)
    # =========================================================================
    async def generar_nivel_reto(self, file_obj, tema_nivel: str, dificultad: str = "medio") -> dict:
        print(f"🧠 GROQ: Creando 3 fases de dominio para: {tema_nivel}...")
        texto_pdf = self._extraer_texto_pdf(file_obj.path)
        
        prompt_sys = """
        Eres un profesor experto diseñando un sistema de aprendizaje escalonado basado en el texto adjunto.
        DEBES responder EXCLUSIVAMENTE con un objeto JSON válido.
        
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
        {
            "fase_1": [
                { "tipo": "test", "pregunta": "...", "opciones": ["A", "B", "C", "D"], "respuesta_correcta": 0, "explicacion": "..." }
            ],
            "fase_2": [
                { "tipo": "verdadero_falso", "pregunta": "...", "opciones": ["Verdadero", "Falso"], "respuesta_correcta": 1, "explicacion": "..." }
            ],
            "fase_3": [
                { "tipo": "huecos", "pregunta": "El _____ es azul.", "opciones": ["Cielo", "Suelo", "Mar"], "respuesta_correcta": 0, "explicacion": "..." }
            ]
        }
        """
        
        prompt_usr = f"""
        Tema principal a evaluar: "{tema_nivel}".
        Dificultad base: {dificultad}.
        
        Basándote estrictamente en el texto proporcionado, genera el JSON con las 3 fases (fase_1, fase_2, fase_3) con 10 preguntas CADA UNA (30 preguntas en total).
        
        TEXTO DEL DOCUMENTO:
        {texto_pdf}
        """
        
        res = await self._intentar_generar(prompt_sys, prompt_usr)
        return res if res else {"fase_1": [], "fase_2": [], "fase_3": []}

    # =========================================================================
    # 3. TEST RÁPIDO
    # =========================================================================
    async def generar_test_biblioteca(self, file_obj, cantidad: int = 10) -> list:
        print(f"🧠 GROQ: Generando test rápido de {cantidad} preguntas...")
        texto_pdf = self._extraer_texto_pdf(file_obj.path)
        
        prompt_sys = """
        Eres un experto generador de exámenes tipo test.
        DEBES responder EXCLUSIVAMENTE con un objeto JSON válido que contenga una única clave llamada "preguntas", cuyo valor sea un array de objetos.
        
        REGLAS CRÍTICAS DE FORMATO:
        1. Formato JSON estricto.
        2. RESPETA LAS MAYÚSCULAS INICIALES EN LAS CLAVES EXACTAMENTE COMO EN ESTE SCHEMA: 'Pregunta', 'Opciones', 'Indice_correcta', 'Explicacion'.
        3. El valor de "Indice_correcta" debe ser SIEMPRE un número entero (0, 1, 2 o 3), no texto.
        
        SCHEMA JSON OBLIGATORIO:
        {
          "preguntas": [
            {
              "Pregunta": "¿Enunciado...?",
              "Opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
              "Indice_correcta": 0,
              "Explicacion": "Justificación breve."
            }
          ]
        }
        """
        
        prompt_usr = f"""
        Genera un test EXHAUSTIVO de EXACTAMENTE {cantidad} preguntas tipo test basadas estrictamente en el documento proporcionado.
        
        REGLA CRÍTICA: Debes generar exactamente {cantidad} objetos JSON dentro del array. Ni uno menos.
        
        TEXTO DEL DOCUMENTO:
        {texto_pdf}
        """
        
        res = await self._intentar_generar(prompt_sys, prompt_usr)
        return res.get("preguntas", []) if res else []

    # =========================================================================
    # 4. ANALIZADOR OFICIAL
    # =========================================================================
    async def analizar_pdf_examen_real(self, file_obj) -> dict:
        print(f"🧠 GROQ: Analizando examen oficial...")
        texto_pdf = self._extraer_texto_pdf(file_obj.path)
        
        prompt_sys = """
        Eres un sistema avanzado de extracción de datos.
        
        REGLAS CRÍTICAS:
        1. Si el texto contiene AL MENOS UNA pregunta tipo test (enunciado + opciones), DEBES marcar "apto" como true. NO rechaces el documento por tener portadas, temarios o bases legales al principio.
        2. DEBES devolver un objeto JSON estricto.
        3. RESPETA LAS MAYÚSCULAS EN LAS CLAVES DEL ARRAY: 'Pregunta', 'Opciones', 'Indice_correcta', 'Explicacion'.
        4. MUY IMPORTANTE: Como los exámenes oficiales no suelen traer explicaciones, DEBES generar tú mismo una breve (2-3 líneas) y clara justificación ("Explicacion") para cada respuesta correcta que extraigas
        """
        
        prompt_usr = f"""
        Analiza el texto adjunto. Si encuentras preguntas de examen tipo test, extráelas todas.
        Si no indican la respuesta correcta, adivínala (o pon 0 por defecto) pero SIEMPRE razona el porqué en el campo "Explicacion".
        
        FORMATO JSON ESPERADO:
        {{
            "apto": true,
            "motivo": "Explica por qué no es apto si es el caso.",
            "preguntas": [
                {{
                    "Pregunta": "Texto de la pregunta...",
                    "Opciones": ["A", "B", "C", "D"],
                    "Indice_correcta": 0,
                    "Explicacion": "Justificación generada por ti razonando por qué esta respuesta es la correcta."
                }}
            ]
        }}
        
        TEXTO DEL EXAMEN:
        {texto_pdf[:40000]}
        """
        res = await self._intentar_generar(prompt_sys, prompt_usr)
        return res if res else {"apto": False, "motivo": "Error procesando con Groq.", "preguntas": []}