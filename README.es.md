<p align="center">
  <img src="./public/images/ogimage.jpg" alt="Tube Reply Banner" width="100%">
</p>

# Tube Reply

_🌍 [Read this in English](./README.md)_

Tube Reply es el centro de mando definitivo para creadores de YouTube que buscan escalar su comunidad con inteligencia artificial. No es solo un gestor de comentarios; es un ecosistema completo de **estrategia y analítica** que sincroniza tu canal en tiempo real, genera respuestas inteligentes basadas en tu propia **Base de Conocimientos** y ofrece **insights profundos** sobre tu audiencia. Desde el seguimiento de sentimientos y la identificación de "Superfans" hasta la creación de **Blueprints Estratégicos** para tus próximos vídeos, Tube Reply transforma la gestión de tu canal en una ventaja competitiva, todo centralizado en un panel premium privado, gratis y seguro.

---

## Características

- **Sincronización de comentarios** — extrae los comentarios principales de todos los vídeos del canal a través de la API de YouTube Data v3.
- **Sugerencias de respuesta con IA** — generadas mediante Google Gemini u OpenAI, informadas por tu Base de Conocimientos.
- **Detección de idioma y corrección** — detecta el idioma (20+ idiomas) y permite cambiarlo manualmente si es necesario.
- **Resúmenes de vídeos** — resúmenes generados por IA para cada vídeo, utilizados como contexto al generar respuestas.
- **Base de Conocimientos** — entrena a la IA con guías de estilo, FAQs, personas, temas y reglas personalizadas. **Ahora con auto-generación impulsada por IA** basada en los datos reales de tu canal.
- **Insights de Vídeo y Blueprints** — análisis impulsado por IA de los patrones de comentarios para generar ideas de vídeos virales y planos de contenido estratégico.
- **Analíticas Avanzadas** — monitoriza tendencias de sentimiento, distribución de idiomas e identifica a tus "Superfans" (comentaristas más activos).
- **Visualización de Alto Nivel** — disfruta de un panel premium con estética glassmorphic, visualizaciones de datos en tiempo real, transiciones animadas y analíticas detalladas para cada vídeo.
- **Publicación en un clic** — aprueba y publica respuestas directamente en YouTube sin salir de la aplicación.
- **Baneo de usuarios** — bloquea usuarios problemáticos directamente desde la vista de comentarios.
- **Moderación masiva** — aprueba, descarta u omite múltiples comentarios a la vez desde la lista.
- **Agente de IA del Canal** — chatbot especializado para generar ideas de vídeos, analizar el crecimiento del canal y consultar el contexto de tu base de datos.
- **Cambio de proveedor IA** — alterna entre Google Gemini y OpenAI sobre la marcha desde los ajustes.
- **Gestión de cuota** — monitoriza la cuota diaria de la API de YouTube, con un límite configurable.
- **Seguridad avanzada** — rate limiting, protección CSRF y encriptación AES-256-GCM para tokens.
- **Soporte PWA** — aplicación web instalable con capacidades offline e iconos personalizados.
- **Diseño Responsivo** — Totalmente optimizado para escritorio, tablet y móviles con una estética premium en modo oscuro.

---

## Stack Tecnológico

| Capa          | Tecnología                                   |
| ------------- | -------------------------------------------- |
| Framework     | Nuxt 3                                       |
| UI            | Vue 3 + @nuxt/ui + Tailwind CSS              |
| Base de Datos | **SQLite** (better-sqlite3) + Drizzle        |
| IA            | Google Gemini & OpenAI                       |
| YouTube       | Google APIs OAuth2 (`googleapis`)            |
| Auth          | Cookie de sesión + hash de contraseña bcrypt |
| Encriptación  | AES-256-GCM (almacenamiento de tokens)       |
| PWA           | @vite-pwa/nuxt                               |

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

| Característica          | GPT-4o mini        | Gemini 3.0 Flash Preview               |
| :---------------------- | :----------------- | :------------------------------------- |
| **Precio de Entrada**   | $0.15              | $0.50                                  |
| **Entrada en Caché**    | $0.075             | $0.05                                  |
| **Precio de Salida**    | $0.60              | $3.00                                  |
| **Ventana de Contexto** | 128K tokens        | 1M+ tokens                             |
| **Especialidad**        | Precisión y Lógica | Contexto Masivo y Grounding con Google |

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

- **Contexto Basado en DDBB (RAG)**: La aplicación utiliza su **base de datos SQLite** interna para proporcionar contexto en tiempo real. Si un usuario pregunta _"¿Dónde está el vídeo sobre X?"_, la IA utiliza **Function Calling** para buscar en la DDBB títulos y miniaturas de vídeos relevantes, ofreciendo una respuesta fundamentada con enlaces válidos.
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
- **Agente de IA del Canal**: Una interfaz de chat interna dedicada, impulsada por Gemini Flash, que actúa como consultor de tu canal. Tiene acceso completo al contexto de tu base de datos (historial de vídeos, resúmenes y base de conocimientos) para ayudarte a idear nuevo contenido, responder preguntas específicas sobre tu canal o perfeccionar tu estrategia.
- **Insights de Vídeo y Blueprints**: Un motor especializado que agrupa los comentarios de los usuarios en temas semánticos para identificar qué está pidiendo tu audiencia. Genera planos de vídeo completos que incluyen "Ganchos Virales", "Objetivos Estratégicos" y "Guías de Producción" para maximizar el rendimiento de tu próximo vídeo.
- **Analíticas de Audiencia Avanzadas**:
  - **Seguimiento de Sentimiento**: Monitoriza cómo evoluciona el "humor" de tu comunidad a lo largo del tiempo con tendencias de sentimiento semanales.
  - **Ranking de Superfans**: Identifica a tus espectadores más leales basándose en la frecuencia de comentarios y el compromiso.
  - **Distribución de Idiomas**: Entiende el alcance global de tu canal con analíticas de detección automática de idiomas.
- **Generación de Base de Conocimientos con IA**: Amplía automáticamente tu base de conocimientos permitiendo que la IA analice tus mejores vídeos y las preguntas más frecuentes de los usuarios. Identifica patrones y sugiere nuevas FAQs, reglas de estilo y entradas de contexto para mantener las respuestas de tu IA precisas y actualizadas con el mínimo esfuerzo.
- **Planificador Automático (Scheduler)**: El sistema incluye un planificador en segundo plano que realiza "Escaneos Profundos" de tu canal (todos los vídeos) 4 veces al día (cada 6 horas) para asegurar que todos los comentarios estén sincronizados y las sugerencias de IA se disparen automáticamente.

---

## Cuota de API de YouTube y Sincronización Inteligente

Tube Reply cuenta con un motor de sincronización altamente optimizado diseñado para minimizar el consumo de cuota de la API mientras mantiene tus comentarios actualizados.

- **Cuota Gratuita Diaria**: 10,000 unidades.
- **Sincronización Inteligente (Por defecto)**: Utiliza una consulta optimizada a nivel de canal (`allThreadsRelatedToChannelId`) para obtener los últimos comentarios de todo el canal en una sola operación.
  - **Coste**: ~1-5 unidades por sincronización.
  - **Frecuencia**: Cada 30-60 minutos (configurable).
  - **Beneficio**: Incluso con más de 3,000 vídeos, una sincronización manual o programada "reciente" solo consume un puñado de unidades de cuota.
- **Sincronización Profunda**: Realiza un escaneo completo de todos los vídeos del canal para capturar comentarios en contenido antiguo.
  - **Coste**: ~1 unidad por vídeo.
  - **Frecuencia**: 4 veces al día (cada 6 horas) por defecto.
  - **Ejemplo**: Si tienes 1,000 vídeos, una sincronización profunda consume 1,000 unidades.
- **Coste de Respuesta**: Publicar una respuesta a un comentario consume **50 unidades** por acción.
- **Protección de Cuota**: La app rastrea el consumo diario y detiene automáticamente la sincronización si se acerca al límite diario (configurable en el `.env`).

---

## Requisitos

- Node.js 20+ (Probado en 25.9.0)
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

| Variable                          | Descripción                                                              |
| --------------------------------- | ------------------------------------------------------------------------ |
| `ADMIN_PASSWORD_HASH`             | Hash bcrypt — generar con `npm run hash-password`                        |
| `SESSION_DURATION_HOURS`          | Tiempo de vida de la sesión (por defecto: `24`)                          |
| `DATABASE_URL`                    | Ruta al archivo SQLite (por defecto: `./data/youtube.db`)                |
| `YOUTUBE_CLIENT_ID`               | Client ID de OAuth2 de Google Cloud Console                              |
| `YOUTUBE_CLIENT_SECRET`           | Client secret de OAuth2                                                  |
| `YOUTUBE_REDIRECT_URI`            | Debe coincidir con el redirect URI autorizado en GCP                     |
| `GEMINI_API_KEY`                  | Clave API de Google AI Studio                                            |
| `GEMINI_MODEL`                    | ID del modelo Gemini (ej. `gemini-3-flash-preview`)                      |
| `OPENAI_API_KEY`                  | Clave API de OpenAI                                                      |
| `OPENAI_MODEL`                    | ID del modelo OpenAI (ej. `gpt-4o-mini`)                                 |
| `AI_PROVIDER`                     | Proveedor por defecto: `gemini` u `openai`                               |
| `TOKEN_ENCRYPTION_KEY`            | 64 caracteres hex (32 bytes) para encriptar tokens con AES-256-GCM       |
| `SYNC_INTERVAL_MINUTES`           | Intervalo de auto-sincronización (por defecto: `30`)                     |
| `AUTO_SYNC_ON_START`              | Sincronizar al iniciar el servidor (por defecto: `true`)                 |
| `MAX_QUOTA_PER_DAY`               | Límite máximo de cuota de la API de YouTube (por defecto: `8500`)        |
| `RATE_LIMIT_LOGIN_MAX`            | Intentos de inicio de sesión máximos por ventana (por defecto: `5`)      |
| `RATE_LIMIT_LOGIN_WINDOW_MINUTES` | Ventana de tiempo para límite de peticiones de login (por defecto: `15`) |
| `LOCKOUT_DURATION_MINUTES`        | Duración del bloqueo tras fallos de login (por defecto: `30`)            |
| `LOG_RETENTION_DAYS`              | Días para mantener logs de errores/actividad (por defecto: `30`)         |

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
