# Curso CKA Web Local

Vista de estudio para el material del curso. **No modifica los TXT**: el navegador los lee en tiempo real desde un servidor HTTP local y los convierte en una web navegable.

## Módulos en ficheros separados

La fuente del curso es la carpeta `modulos/`, con **un fichero TXT por módulo**:

```text
modulos/
  M00-entorno-kubectl.txt
  M01-arquitectura.txt
  M02-instalacion-kubeadm.txt
  M03-rbac-seguridad.txt
```

- **Añadir un módulo** = crear `modulos/M04-lo-que-sea.txt` y refrescar el navegador (en local, `start.sh` regenera el índice al arrancar; si ya tenías el servidor corriendo, ejecuta `bash cka-study-web/build-manifest.sh` o simplemente reinicia `start.sh`).
- El nombre debe **empezar por `MXX`** (eso define el orden); el resto del nombre es solo descriptivo.
- El contenido interno es el mismo formato de siempre (`==== / MXX - TÍTULO / ==== / MODULO: MXX ...`): el título que se muestra sale de esa cabecera, no del nombre del fichero.
- Si la carpeta `modulos/` no existe, la web cae automáticamente al fichero único `CURSO-CKA-claude.txt` (que se conserva como respaldo, ya no hace falta editarlo).
- El progreso guardado no se pierde al reorganizar ficheros: cada sección se identifica por módulo + título.

### Cómo descubre la web los módulos (tres fuentes, en orden)

1. **`modulos/index.json`** — manifiesto con la lista de ficheros, generado por `cka-study-web/build-manifest.sh`. Es lo que permite desplegar en **hosting estático**, donde el servidor no genera listados de directorio. En producción lo regenera `build.sh` (raíz del repo) en cada despliegue.
2. **Listado de directorio** de `modulos/` — lo genera el `python http.server` de `start.sh`; cubre el uso local aunque el manifiesto falte o esté vacío.
3. **`CURSO-CKA-claude.txt`** — TXT único original, último recurso.

Si el manifiesto lista un fichero que ya no existe, ese fichero se omite (aviso en la consola del navegador) sin tumbar la carga.

## Abrir

Desde la raíz del proyecto:

```bash
bash cka-study-web/start.sh
```

Arranca el servidor y abre el navegador automáticamente en `http://127.0.0.1:8000/cka-study-web/`.

Si el puerto 8000 está ocupado:

```bash
bash cka-study-web/start.sh 8010
```

Abrir `index.html` con doble clic **no** funciona: desde `file://` el navegador bloquea la lectura del TXT.

## Funciones de estudio

- **Un módulo a la vez** con botones Anterior/Siguiente e índice lateral por secciones (clic para saltar).
- **Checkpoints como quiz**: las preguntas se muestran con la respuesta oculta; púlsala solo cuando tengas tu respuesta.
- **Soluciones de los laboratorios tapadas** (borrosas) hasta que pulses "Mostrar solución".
- **Cronómetro** en cada laboratorio cronometrado, con el objetivo de tiempo del enunciado; se pone rojo si te pasas.
- **Progreso**: marca secciones como estudiadas con el círculo ✓; verás barras de progreso por módulo y globales, y un chip "Continuar" para volver donde lo dejaste.
- **Búsqueda global** con fragmentos: los resultados saltan a la sección exacta.
- **Tema claro/oscuro** con el botón de la esquina superior derecha.
- **Copiar** cualquier bloque de comandos/YAML con un clic, con resaltado de sintaxis.

## Dónde se guarda tu progreso

En el `localStorage` del navegador (claves `cka.progress`, `cka.theme`, `cka.lastPosition`). No se escribe nada en los ficheros del curso. Si limpias los datos del sitio, el progreso se reinicia.

## Actualizar contenido

Edita el TXT del módulo en `modulos/` y refresca la página: la web vuelve a leer los ficheros y reconstruye índice, secciones, quiz y búsqueda. El progreso guardado se conserva porque cada sección se identifica por módulo + título (no por posición ni por fichero).
