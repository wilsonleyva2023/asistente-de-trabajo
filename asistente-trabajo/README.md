# Asistente de Trabajo — Manual de puesta en marcha

Este proyecto es tu asistente propio por Telegram. Acá tenés todo lo necesario para dejarlo funcionando.

## Lo que ya hace

- `/nuevocliente` — carga un cliente nuevo (nombre, teléfono, dirección, notas)
- `/clientes` — busca un cliente y te muestra su ficha completa
- `/presupuesto` — arma un presupuesto y te genera el PDF
- `/recibo` — genera un recibo de pago en PDF
- `/trabajo` — registra un trabajo realizado (por texto por ahora)
- `/equipo` — registra un equipo instalado y programa el aviso de mantenimiento futuro (automático o para vos)
- `/recordatorio` — crea un recordatorio con fecha y hora
- `/pendientes` — lista los cobros pendientes
- `/recontactar` — lista presupuestos que no se cerraron, para volver a contactar al cliente
- `/agenda` — muestra la agenda de hoy (también se manda sola a las 21:00 y 8:00)
- Resumen semanal automático los domingos a las 20:00
- Aviso automático de mantenimientos vencidos todos los días a las 10:00

## Lo que falta conectar más adelante

- Transcripción de audio (necesita la cuenta de OpenAI que quedó pendiente)
- Envío 100% automático de mensajes al cliente por WhatsApp (por ahora, el bot te arma el mensaje listo y vos lo reenviás)

---

## Paso 1 — Preparar la base de datos

1. Entrá a tu proyecto de Supabase.
2. En el menú de la izquierda, buscá **SQL Editor**.
3. Tocá **New query**.
4. Abrí el archivo `supabase/schema.sql` de esta carpeta, copiá TODO el contenido, y pegalo ahí.
5. Tocá **Run** (o el botón ▶️). Tiene que decir "Success" al terminar.

## Paso 2 — Subir el código a GitHub (sin usar la terminal)

1. Andá a github.com y creá una cuenta gratis si no tenés (con tu email).
2. Una vez adentro, tocá el botón verde **"New"** (o el ícono `+` arriba a la derecha → "New repository").
3. Ponele de nombre `asistente-trabajo`, dejalo en **Private** (privado), y tocá **Create repository**.
4. En la pantalla que aparece, buscá el link que dice **"uploading an existing file"**.
5. Arrastrá TODOS los archivos y carpetas de este proyecto a esa página (excepto la carpeta `node_modules` si existiera, y el archivo `.env` si lo llegaste a crear — esos NUNCA se suben).
6. Abajo escribí un mensaje como "Primera versión" y tocá **Commit changes**.

## Paso 3 — Conectar el repositorio con Render

1. Entrá a tu cuenta de Render (render.com).
2. Tocá **New +** → **Web Service**.
3. Conectá tu cuenta de GitHub si te lo pide, y elegí el repositorio `asistente-trabajo`.
4. Completá:
   - **Name**: asistente-trabajo (o el que quieras)
   - **Region**: la más cercana disponible
   - **Branch**: main
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Bajá hasta **Environment Variables** y agregá cada una de estas (los valores están en tu bloc de notas):
   - `TELEGRAM_BOT_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NOMBRE_NEGOCIO` (poné el nombre de tu negocio)
   - `TELEGRAM_CHAT_ID_PERMITIDO` (por ahora dejalo vacío o poné 0, en el Paso 4 te explico cómo conseguirlo)
6. Tocá **Create Web Service**. Va a tardar unos minutos en desplegar. Cuando el estado diga **"Live"**, ya está funcionando.

## Paso 4 — Conseguir tu Chat ID de Telegram (para que el bot solo te responda a vos)

1. En Telegram, buscá el bot que creaste y mandale cualquier mensaje (ej: "hola").
2. Andá a tu navegador y entrá a esta dirección, reemplazando TU_TOKEN por el token de tu bot:
   `https://api.telegram.org/botTU_TOKEN/getUpdates`
3. Vas a ver un texto con un campo que dice `"chat":{"id":` seguido de un número. Ese número es tu Chat ID.
4. Volvé a Render, a tu servicio → **Environment** → editá `TELEGRAM_CHAT_ID_PERMITIDO` y pegá ese número.
5. Guardá — Render va a reiniciar el servicio solo.

## Paso 5 — Probarlo

Andá a Telegram, abrí el chat con tu bot, y mandale `/start`. Si te responde con la lista de comandos, ¡ya está funcionando! 🎉

## Nota sobre el plan gratuito de Render

El plan Free "duerme" el servicio si pasa un rato sin actividad, y tarda unos segundos en despertarse con el primer mensaje. Para los recordatorios y avisos automáticos programados esto puede hacer que a veces lleguen con algunos minutos de demora en vez de justo a la hora — no afecta la lista de clientes, presupuestos ni nada de lo que ya guardaste, solo la puntualidad exacta de los avisos.
