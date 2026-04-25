<p align="center">
  <img src="./public/images/ogimage.jpg" alt="Tube Reply Banner" width="100%">
</p>

# Tube Reply

*🌍 [Read this in English](./README.md)*

Herramienta de gestión de comentarios de YouTube impulsada por IA. Sincroniza comentarios de tu canal, genera sugerencias de respuesta mediante Google Gemini o OpenAI, y publica las respuestas directamente en YouTube — todo desde un único panel privado.

---

## Características

- **Sincronización de comentarios** — extrae los comentarios principales de todos los vídeos del canal a través de la API de YouTube Data v3.
- **Sugerencias de respuesta con IA** — generadas mediante Google Gemini u OpenAI, informadas por tu Base de Conocimientos.
- **Detección de idioma y corrección** — detecta el idioma (20+ idiomas) y permite cambiarlo manualmente si es necesario.
- **Resúmenes de vídeos** — resúmenes generados por IA para cada vídeo, utilizados como contexto al generar respuestas.
- **Base de Conocimientos** — entrena a la IA con guías de estilo, FAQs, personas, temas y reglas personalizadas.
- **Publicación en un clic** — aprueba y publica respuestas directamente en YouTube sin salir de la aplicación.
- **Baneo de usuarios** — bloquea usuarios problemáticos directamente desde la vista de comentarios.
- **Moderación masiva** — aprueba, descarta u omite múltiples comentarios a la vez desde la lista.
- **Cambio de proveedor IA** — alterna entre Google Gemini y OpenAI sobre la marcha desde los ajustes.
- **Gestión de cuota** — monitoriza la cuota diaria de la API de YouTube, con un límite configurable.
- **Seguridad avanzada** — rate limiting, protección CSRF y encriptación AES-256-GCM para tokens.
- **Soporte PWA** — aplicación web instalable con capacidades offline e iconos personalizados.

---

## Stack Tecnológico

| Capa       | Tecnología                            |
| ---------- | ------------------------------------- |
| Framework  | Nuxt 3                                |
| UI         | Vue 3 + @nuxt/ui + Tailwind CSS       |
| Base de Datos| **SQLite** (better-sqlite3) + Drizzle |
| IA         | Google Gemini & OpenAI                |
| YouTube    | Google APIs OAuth2 (`googleapis`)     |
| Auth       | Cookie de sesión + hash de contraseña bcrypt |
| Encriptación| AES-256-GCM (almacenamiento de tokens) |
| PWA        | @vite-pwa/nuxt                        |

---

## Gestión de la Base de Datos

Tube Reply utiliza **SQLite** por su simplicidad y portabilidad. Una de sus características principales es el **Sistema de Auto-Migración**:

- **Sin configuración manual**: La aplicación detecta automáticamente si el archivo de la base de datos existe.
- **Auto-Aprovisionamiento**: En la primera ejecución, crea el archivo de la base de datos y todas las tablas necesarias.
- **Migraciones Zero-Config**: Cada vez que la aplicación se inicia, comprueba si hay actualizaciones de esquema pendientes y las aplica automáticamente. No es necesario ejecutar `npm run db:migrate` manualmente (aunque está disponible para usos avanzados).

---

## Inteligencia Artificial y Modelos

Tube Reply está altamente optimizada en rendimiento y rentabilidad. Utiliza modelos **Mini/Flash** que proporcionan un razonamiento de nivel premium a una fracción del coste de los modelos estándar.

### Comparativa de Modelos y Precios (por 1M tokens)

| Característica | GPT-4o mini | Gemini 3.0 Flash Preview |
| :--- | :--- | :--- |
| **Precio de Entrada** | $0.15 | $0.50 |
| **Entrada en Caché** | $0.075 | $0.05 |
| **Precio de Salida** | $0.60 | $3.00 |
| **Ventana de Contexto** | 128K tokens | 1M+ tokens |
| **Especialidad** | Precisión y Lógica | Contexto Masivo y Grounding con Google |

> [!NOTE]
> **Gemini 3 Flash** también soporta "Grounding with Google Search" para obtener información en tiempo real y ofrece integración profunda con Google Maps.

### Caso de Uso Típico y Estimación de Costes

En un escenario típico con **200 vídeos en tu base de datos** y una **Base de Conocimientos** activa (Guías de estilo, FAQs):

- **Contexto Promedio por Petición**: ~2,500 - 3,500 tokens (incluye entradas de la Base de Conocimientos, título del vídeo, resumen del vídeo generado por IA y títulos de vídeos recientes como referencia).
- **Salida Promedio**: ~150 - 250 tokens (la respuesta en sí).

**Coste Estimado (GPT-4o mini):**
- **100 respuestas**: ~$0.05 USD
- **1,000 respuestas**: ~$0.50 USD

**Coste Estimado (Gemini 3.0 Flash Preview):**
- **100 respuestas**: ~$0.19 USD
- **1,000 respuestas**: ~$1.85 USD

### Funciones de Inteligencia
- **Contexto Basado en DDBB (RAG)**: La aplicación utiliza su **base de datos SQLite** interna para proporcionar contexto en tiempo real. Si un usuario pregunta *"¿Dónde está el vídeo sobre X?"*, la IA utiliza **Function Calling** para buscar en la DDBB títulos y miniaturas de vídeos relevantes, ofreciendo una respuesta fundamentada con enlaces válidos.
- **Protección contra Alucinaciones**: Cada enlace generado por la IA se comprueba con la base de datos. Cualquier ID de vídeo "alucinado" (inexistente) se elimina automáticamente antes de guardar la sugerencia.
- **Auto-Sumarización**: En la primera petición sobre un vídeo, el sistema genera automáticamente un resumen conciso mediante IA sobre el contenido del vídeo, que se utilizará como contexto permanente para todos los comentarios futuros en dicho vídeo.
- **Moderación de Usuarios**:
    - **Baneo en un clic**: Utiliza la API de YouTube para rechazar el comentario y bloquear al autor en el canal.
    - **Rastreo Local**: Los autores baneados se guardan en la base de datos. Todos sus comentarios (actuales y futuros) se marcan automáticamente como "Descartados".
    - **Desbanear**: Restaura a los autores localmente con un clic. (Se requiere eliminación manual en YouTube Studio para una restauración completa en la plataforma).
- **Sugerencias Automáticas con IA**: Cuando se activa en los Ajustes, el sistema dispara automáticamente el motor de sugerencias justo después de terminar un proceso de sincronización (ya sea manual o programado).
  - **Procesamiento Secuencial**: Para respetar los límites de velocidad (RPM) de los proveedores de IA, los comentarios se procesan uno a uno con un retraso integrado.
  - **Selección Inteligente**: Solo procesa comentarios de nivel superior en estado "Pendiente" que aún no tengan una sugerencia generada, evitando llamadas redundantes e innecesarias.
  - **Ejecución en Segundo Plano**: El proceso se ejecuta en segundo plano, permitiéndote seguir usando el panel de control mientras se generan las sugerencias.

---

## Requisitos

- Node.js 20+
- Proyecto en Google Cloud con:
  - YouTube Data API v3 habilitada
  - Credenciales OAuth 2.0 (Tipo Aplicación Web)
- Clave de API de Google AI Studio (Gemini) o clave de API de OpenAI

---

## Configuración

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar entorno

Copia `.env.example` a `.env` y rellena todos los valores:

```bash
cp .env.example .env
```

| Variable                          | Descripción                                              |
| --------------------------------- | -------------------------------------------------------- |
| `ADMIN_PASSWORD_HASH`             | Hash bcrypt — generar con `npm run hash-password`        |
| `SESSION_DURATION_HOURS`          | Tiempo de vida de la sesión (por defecto: `24`)          |
| `DATABASE_URL`                    | Ruta al archivo SQLite (por defecto: `./data/youtube.db`)|
| `YOUTUBE_CLIENT_ID`               | Client ID de OAuth2 de Google Cloud Console              |
| `YOUTUBE_CLIENT_SECRET`           | Client secret de OAuth2                                  |
| `YOUTUBE_REDIRECT_URI`            | Debe coincidir con el redirect URI autorizado en GCP     |
| `GEMINI_API_KEY`                  | Clave API de Google AI Studio                            |
| `GEMINI_MODEL`                    | ID del modelo Gemini (ej. `gemini-3.0-flash-preview`)      |
| `OPENAI_API_KEY`                  | Clave API de OpenAI                                      |
| `OPENAI_MODEL`                    | ID del modelo OpenAI (ej. `gpt-4o-mini`)                 |
| `AI_PROVIDER`                     | Proveedor por defecto: `gemini` u `openai`               |
| `TOKEN_ENCRYPTION_KEY`            | 64 caracteres hex (32 bytes) para encriptar tokens con AES-256-GCM |
| `SYNC_INTERVAL_MINUTES`           | Intervalo de auto-sincronización (por defecto: `30`)     |
| `AUTO_SYNC_ON_START`             | Sincronizar al iniciar el servidor (por defecto: `true`) |
| `MAX_QUOTA_PER_DAY`               | Límite máximo de cuota de la API de YouTube (por defecto: `8500`) |
| `RATE_LIMIT_LOGIN_MAX`            | Intentos de inicio de sesión máximos por ventana (por defecto: `5`) |
| `RATE_LIMIT_LOGIN_WINDOW_MINUTES` | Ventana de tiempo para límite de peticiones de login (por defecto: `15`) |
| `LOCKOUT_DURATION_MINUTES`        | Duración del bloqueo tras fallos de login (por defecto: `30`) |
| `LOG_RETENTION_DAYS`              | Días para mantener logs de errores/actividad (por defecto: `30`) |

**Generar secretos:**

```bash
# ADMIN_PASSWORD_HASH
npm run hash-password
```

### 3. Iniciar servidor de desarrollo

```bash
npm run dev
```

La base de datos se inicializará y migrará automáticamente al iniciar.
La aplicación se ejecuta en `http://localhost:3000`.

---

## Configuración en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Crea un proyecto nuevo (o utiliza uno existente)
3. Habilita **YouTube Data API v3**
4. Crea un **OAuth 2.0 Client ID** → Aplicación Web (Web application)
5. Añade el URI de redirección autorizado: `http://localhost:3000/api/youtube/callback` (o la URL de producción)
6. Copia el Client ID y el Client Secret al archivo `.env`

---

## Scopes de YouTube OAuth

La aplicación solicita los siguientes permisos:

- `https://www.googleapis.com/auth/youtube.readonly` — para leer vídeos y comentarios
- `https://www.googleapis.com/auth/youtube.force-ssl` — para publicar respuestas a los comentarios

---

## Scripts

| Comando                 | Descripción                                |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | Iniciar servidor de desarrollo             |
| `npm run build`         | Compilar para producción                   |
| `npm run preview`       | Previsualizar la compilación de producción |
| `npm run db:migrate`    | Ejecutar migraciones pendientes de DDBB    |
| `npm run db:generate`   | Generar nueva migración si hay cambios     |
| `npm run db:push`       | Empujar el esquema directo (solo dev)      |
| `npm run hash-password` | Generar hash bcrypt para la contraseña     |

---

## Tipos de Base de Conocimientos (Knowledge Base)

| Tipo    | Propósito                                  |
| ------- | ------------------------------------------ |
| `faq`   | Preguntas comunes y respuestas aprobadas   |
| `style` | Guía de tono, voz y personalidad de la IA  |
| `info`  | Información de contexto y temas generales  |
| `rule`  | Reglas estrictas (qué decir o nunca decir) |

Las entradas activas se inyectan como contexto en cada petición a la IA.

---

## Notas de Seguridad

- El acceso de administrador es de usuario único mediante una contraseña con hash bcrypt en el archivo `.env`.
- Los tokens OAuth de YouTube se almacenan encriptados (AES-256-GCM) en SQLite.
- Todas las rutas de la API que modifican estado están protegidas por middleware CSRF.
- El endpoint de login tiene limitación de peticiones (rate limiting) y bloqueo por IP.
- Las sesiones utilizan cookies firmadas "HTTP-only".

---

## Despliegue en Producción

### Node.js Estándar

```bash
npm run build
node .output/server/index.mjs
```

### Despliegue en Plesk

Si utilizas **Plesk**, el despliegue es sencillo usando la extensión integrada de Node.js:

1. **Application Root (Raíz de la app)**: El directorio de tu proyecto.
2. **Document Root**: `/public`.
3. **Application Startup File (Archivo de inicio)**: `.output/server/index.mjs`.
4. **Environment Variables (Variables de Entorno)**: Añade todas tus variables del `.env` en el panel de configuración de Node.js de Plesk.
5. **Flujo de trabajo**:
   - Haz clic en **NPM Install**.
   - Ejecuta **NPM Run Build** (vía SSH o usando el botón "Ejecutar script" en Plesk).
   - Haz clic en **Restart App** (Reiniciar App) para aplicar los cambios.

Actualiza `YOUTUBE_REDIRECT_URI` y todos los secretos en tu entorno de producción. Nunca hagas commit del archivo `.env` en tu control de versiones.

---

## Licencia

Este proyecto está bajo la [Licencia MIT](LICENSE) - 100% gratis para usar, modificar y distribuir.
