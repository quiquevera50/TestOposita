import pypdf
import requests
import io

class PDFAdapter:
    def extraer_texto(self, ruta_archivo: str) -> str:
        """
        Abre un PDF (ya sea local o una URL de Supabase) y devuelve todo su texto.
        """
        texto_completo = ""
        try:
            print(f"[PDF ADAPTER] Leyendo archivo: {ruta_archivo}")
            
            # 👇 LA MAGIA: Si es una URL, lo descarga a la memoria RAM
            if ruta_archivo.startswith("http"):
                response = requests.get(ruta_archivo)
                response.raise_for_status()
                pdf_file = io.BytesIO(response.content)
            else:
                # Si es un archivo local, lo abre normal
                pdf_file = open(ruta_archivo, "rb")
                
            reader = pypdf.PdfReader(pdf_file)
            
            # Recorremos todas las páginas
            for page in reader.pages:
                texto_pagina = page.extract_text()
                if texto_pagina:
                    texto_completo += texto_pagina + "\n"
            
            # Cerramos el archivo solo si lo abrimos del disco duro local
            if not isinstance(pdf_file, io.BytesIO):
                pdf_file.close()
                
            print(f"[PDF ADAPTER] Éxito. Extraídos {len(texto_completo)} caracteres.")
            return texto_completo
            
        except Exception as e:
            print(f"[PDF ADAPTER] Error leyendo el PDF: {e}")
            return ""