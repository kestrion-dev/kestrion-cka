# Kestrion — Preparación CKA en español

Web de estudio interactiva y gratuita para el examen **CKA (Certified Kubernetes Administrator)**, en español.

**➡️ Estudia en [kestrion.dev](https://kestrion.dev)** — sin registro, directamente en el navegador.

## Por qué existe

El CKA es un examen 100 % práctico y contra el reloj. Leer PDFs no entrena eso. Kestrion convierte el material de estudio en una herramienta de entrenamiento:

- 🎓 **Quiz con respuestas ocultas** — los checkpoints de cada módulo son tarjetas de autoevaluación
- ⏱️ **Laboratorios cronometrados** — con el objetivo de tiempo de cada lab, en rojo si te pasas
- 🔒 **Soluciones tapadas** — la solución de referencia queda borrosa hasta que decidas mirarla
- 📈 **Progreso automático** — en tu navegador (localStorage), sin cuentas ni emails
- ⌨️ **Comandos listos** — resaltado de sintaxis y botón de copiar en cada bloque

## Estructura

```
landing/          Página de inicio (kestrion.dev)
cka-study-web/    La app de estudio (kestrion.dev/app)
modulos/          Contenido del curso: un TXT por módulo (M00, M01, ...)
build.sh          Ensambla dist/ para el despliegue (Cloudflare Pages)
```

La app es JavaScript puro, sin dependencias ni framework: parsea los TXT en el navegador. Añadir un módulo = añadir `modulos/M0X-tema.txt`.

## Desarrollo local

```bash
bash cka-study-web/start.sh    # servidor local + abre el navegador
bash build.sh                  # ensambla dist/ como en producción
```

## Licencia

- **Código** (app, landing, scripts): [MIT](LICENSE)
- **Contenido del curso** (`modulos/`): © 2026 Kestrion, todos los derechos reservados — uso personal de estudio permitido; republicación y uso comercial, no. Ver [modulos/LICENSE.txt](modulos/LICENSE.txt).

Kubernetes® y CKA® son marcas registradas de The Linux Foundation. Kestrion es un proyecto educativo independiente, no afiliado a The Linux Foundation ni a la CNCF.
