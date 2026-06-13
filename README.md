# 🦉 TestOposita - Tu Entrenador de Exámenes con IA

**TestOposita** es una aplicación móvil diseñada para ayudar a estudiantes y opositores a practicar de forma eficiente. Utiliza Inteligencia Artificial (**Google Gemini**) para leer tus apuntes en PDF y generar automáticamente tests de preguntas y respuestas, permitiéndote repasar en cualquier lugar, guardar tu progreso y revisar tus errores.

## 🚀 Características Principales

* **🔐 Autenticación Segura:** Registro e inicio de sesión con encriptación avanzada de contraseñas (Argon2).
* **📚 Biblioteca Personal:** Sube, gestiona y elimina tus apuntes en formato PDF directamente desde tu móvil.
* **⚡ Test Rápido con IA:** Genera exámenes de 5 preguntas al instante basándose en cualquier PDF de tu biblioteca.
* **🎮 Modo Juego Interactivo:** Interfaz amigable para responder preguntas con feedback inmediato (acierto/fallo) y explicaciones detalladas.
* **📊 Estadísticas de Progreso:** Visualiza tu rendimiento semanal, porcentaje medio de aciertos y racha de días consecutivos.
* **📜 Historial de Exámenes:** Guarda automáticamente todos tus tests. Revisa pregunta por pregunta lo que hiciste mal para aprender.
* **👤 Perfil Completo:** Gestión de avatar personalizado y control total de datos (incluyendo eliminación de cuenta y archivos).

---

## 🛠️ Tecnologías Utilizadas

### Frontend (Móvil)
* **React Native (Expo):** Framework principal para desarrollo móvil.
* **TypeScript:** Para garantizar un código robusto y tipado.
* **Axios:** Gestión de peticiones HTTP al servidor.
* **Expo Router:** Sistema de navegación moderno basado en archivos.
* **AsyncStorage:** Persistencia de datos de sesión local.

### Backend (Servidor)
* **Python:** Lenguaje base del servidor.
* **FastAPI:** Framework de alto rendimiento para la API REST.
* **SQLite:** Base de datos ligera y eficiente (sin configuraciones complejas).
* **Google Gemini API:** Motor de IA para el procesamiento de texto y generación de preguntas.
* **Argon2 / Passlib:** Librerías de seguridad para hashing de contraseñas.

---

## ⚙️ Instalación y Configuración

Sigue estos pasos para levantar el proyecto en tu entorno local.

### 1. Prerrequisitos
* Node.js y npm instalados.
* Python 3.9 o superior.
* Una cuenta de Google Cloud para obtener la **API Key de Gemini**.
* **Ngrok** (para conectar el móvil al servidor local a través de internet).

### 2. Configurar el Backend (Servidor)

1.  Entra en la carpeta del backend:
    ```bash
    cd backend
    ```
2.  Crea un entorno virtual (recomendado):
    ```bash
    python -m venv venv
    # En Windows:
    venv\Scripts\activate
    # En Mac/Linux:
    source venv/bin/activate
    ```
3.  Instala las dependencias necesarias:
    ```bash
    pip install fastapi uvicorn python-multipart pydantic google-generativeai passlib argon2-cffi
    ```
4.  Configura tu clave de API de Gemini (en `backend/adapters/gemini_adapter.py` o mediante variables de entorno).
5.  Inicia el servidor:
    ```bash
    python main.py
    ```
    *El servidor correrá en `http://127.0.0.1:8000`*

### 3. Configurar Ngrok (Conexión Móvil)

Para que tu móvil vea el servidor de tu PC, necesitas un túnel seguro.

1.  Abre una terminal nueva y ejecuta:
    ```bash
    ngrok http 8000
    ```
2.  Copia la URL `https` que genera (ejemplo: `https://tu-url-random.ngrok-free.app`).

### 4. Configurar el Frontend (App)

1.  Ve a la carpeta raíz del proyecto.
2.  Actualiza la variable `API_URL` en los archivos clave (`app/login.tsx`, `app/(tabs)/index.tsx`, etc.) con tu URL de Ngrok:
    ```typescript
    const API_URL = '[https://tu-url-random.ngrok-free.app](https://tu-url-random.ngrok-free.app)';
    ```
3.  Instala las dependencias de Node:
    ```bash
    npm install
    ```
4.  Inicia la aplicación:
    ```bash
    npx expo start --tunnel
    ```
5.  Escanea el código QR con la app **Expo Go** en tu dispositivo Android o iOS.

---

## 📂 Estructura del Proyecto

```text
/
├── app/                  # Código fuente del Frontend (Pantallas)
│   ├── (tabs)/           # Pantallas principales (Inicio, Biblioteca, Examen)
│   ├── login.tsx         # Pantalla de acceso
│   ├── perfil.tsx        # Pantalla de usuario
│   └── historial.tsx     # Pantalla de revisión de tests
├── backend/              # Código fuente del Servidor
│   ├── main.py           # API Principal y Base de Datos
│   ├── biblioteca.db     # Base de datos SQLite (se crea sola)
│   ├── mis_apuntes/      # Carpeta donde se guardan los PDFs
│   ├── perfiles/         # Carpeta para las fotos de usuario
│   └── adapters/         # Lógica de conexión con Gemini IA
└── package.json          # Dependencias de Node