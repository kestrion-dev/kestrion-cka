# Kestrion CKA — pre-plan de arquitectura V2

Estado: **arquitectura V2 gratuita aprobada. La ejecución requiere autorización por fase.**

Fecha: 7 de septiembre de 2026.

Este documento define la arquitectura aprobada para rediseñar `cka.kestrion.dev`. Debe permitir que una persona o un agente de IA entienda el contexto, las restricciones y las decisiones sin reconstruir la historia desde los commits.

No autoriza cambios de código, migraciones, commits, sincronizaciones ni despliegues. La implementación comenzará únicamente después de la revisión y aprobación explícita del propietario.

## 1. Resumen ejecutivo

La web comenzó como una herramienta local que leía módulos TXT en el navegador. Después se publicó una landing y una aplicación interactiva en `/app/`. Para resolver el SEO se añadieron páginas HTML estáticas en `/modulos/<slug>/`.

La corrección SEO está terminada y publicada. Sin embargo, produjo dos experiencias para el mismo contenido:

- Las páginas `/modulos/<slug>/` son indexables y compartibles, pero no ofrecen toda la experiencia de estudio.
- `/app/` ofrece quiz, progreso, cronómetros y búsqueda, pero es una ruta genérica, está marcada `noindex,follow` y carga el curso en el navegador.

No son dos fuentes de contenido: ambas reutilizan los mismos TXT, `parser.js` y `render.js`. Sí funcionan como dos webs desde la perspectiva del usuario y del producto. Mantenerlas en paralelo aumentaría la duplicación y complicaría cuentas, contenido premium, laboratorios y simuladores.

La dirección aprobada es una única web: cada URL canónica de módulo contendrá el HTML completo para SEO y activará en esa misma página las funciones interactivas. `/app/` desaparecerá al publicar V2; no se requiere compatibilidad con la arquitectura anterior.

La tecnología aprobada para la etapa gratuita es Astro estático sobre Cloudflare Workers Builds. Astro prerenderizará el contenido público y añadirá JavaScript solo a los componentes interactivos. Cualquier arquitectura de servidor futura se decidirá cuando exista un producto que la necesite.

## 2. Antecedentes

### 2.1 Origen

El curso se creó como material de estudio en texto plano. La primera web fue una interfaz local sin backend ni framework:

- Los módulos se almacenan en `modulos/M*.txt`.
- `parser.js` transforma el texto en módulos, secciones, preguntas, laboratorios y bloques de código.
- `render.js` produce el HTML.
- `app.js` controla navegación, búsqueda, progreso, cronómetros y eventos.
- El navegador guarda el estado en `localStorage`.

La prioridad inicial fue estudiar el contenido, no construir una plataforma comercial.

### 2.2 Publicación

La herramienta se convirtió en un sitio público con:

- Landing en `/`.
- Aplicación interactiva en `/app/`.
- Módulos TXT publicados bajo `/modulos/`.
- Cloudflare Workers sirviendo los assets generados en `dist/`.
- Despliegue automático desde el repositorio público cuando se hace push a `main`.

### 2.3 Correcciones de UI y contenido

Antes de la fase SEO se incorporaron, entre otras, estas mejoras que V2 debe conservar:

- Un módulo visible a la vez.
- Índice lateral jerárquico.
- Búsqueda global con resultados por sección.
- Enlaces directos mediante identificadores de sección.
- Quiz con respuestas ocultas.
- Soluciones de laboratorios ocultas.
- Cronómetros con tiempo objetivo.
- Checklist al final de cada sección.
- Progreso global y por módulo.
- Continuación desde la última posición.
- Tema claro y oscuro.
- Resaltado de sintaxis.
- Bloques tipados: `exec`, `config`, `output`, `template` y `reference`.
- Copia limitada a comandos y configuraciones pegables.
- Cero bloques `legacy` en los módulos actuales.

### 2.4 Corrección SEO terminada

La auditoría detectó que los módulos solo existían dentro de una aplicación JavaScript. Se implementó y publicó:

- Una página HTML completa por módulo en `/modulos/<slug>/`.
- Un índice indexable en `/modulos/`.
- Canonical, metadatos sociales, breadcrumbs y navegación anterior/siguiente.
- Sitemap generado automáticamente con ocho URLs: landing, índice y seis módulos.
- `/app/` marcado `noindex,follow` y fuera del sitemap.
- Landing actualizada con seis módulos, cobertura y versión del temario.

Esta implementación demuestra los requisitos técnicos de SEO, pero no impone compatibilidad a V2. El sitio tiene cero tráfico orgánico medible y no existe una audiencia externa que dependa de sus URLs. Los slugs actuales pueden reutilizarse si siguen siendo adecuados, pero también pueden cambiarse con aprobación del propietario.

## 3. Arquitectura actual

### 3.1 Fuente y construcción

```text
modulos/M*.txt
      │
      ├── navegador → parser.js → render.js → /app/
      │
      └── build-pages.js → parser.js → render.js → /modulos/<slug>/

landing/index.html ───────────────────────────────→ /
build.sh ─────────────────────────────────────────→ dist/
wrangler.jsonc ───────────────────────────────────→ Cloudflare Workers
```

`build-pages.js` mantiene además una lista `MODULES` con fichero, slug y descripción. `modulos/index.json` contiene la lista de ficheros. La landing mantiene manualmente otra lista visible. Hay varias representaciones del catálogo que pueden desincronizarse.

### 3.2 Rutas actuales

| Ruta | Función | Indexación | Interactividad |
| --- | --- | --- | --- |
| `/` | Landing | Sí | Mínima |
| `/modulos/` | Índice de módulos | Sí | No |
| `/modulos/<slug>/` | Lectura completa del módulo | Sí | Contenido abierto, sin funciones de estudio |
| `/app/` | Aplicación de estudio | No | Completa |
| `/modulos/M*.txt` | Fuente TXT publicada | No es una página de producto | Descarga directa |

### 3.3 Estado del usuario

No existen cuentas. El navegador utiliza:

- `cka.progress` para secciones completadas.
- `cka.theme` para el tema.
- `cka.lastPosition` para la última posición.

Los identificadores de sección se calculan con código de módulo y título. Cambiar códigos o títulos puede impedir que el estado anterior encuentre la sección correspondiente.

### 3.4 Despliegue actual

```text
push a main del repo público
        ↓
Cloudflare clona el repositorio
        ↓
bash build.sh
        ↓
npx wrangler deploy
        ↓
publicación inmediata
```

No existe una separación efectiva entre guardar código en `main` y publicar en producción. V2 debe contemplar ramas, previews y aprobación antes del despliegue.

## 4. Problema que debe resolver V2

### 4.1 Experiencia fragmentada

Un visitante llega desde Google a `/modulos/<slug>/`, pero debe abandonar esa URL y abrir `/app/` para usar las funciones de estudio. El enlace a `/app/` no conserva necesariamente el módulo o la sección que estaba leyendo.

`/app/#<id-seccion>` puede abrir una sección técnicamente, pero presenta limitaciones:

- La URL no comunica el tema del módulo.
- El fragmento no llega al servidor y no participa en SEO.
- La vista previa social representa `/app/`, no la sección compartida.
- Los IDs dependen de títulos internos y pueden cambiar.
- La ruta no ofrece una jerarquía clara para módulos, laboratorios o simuladores.

### 4.2 Crecimiento duplicado

Una nueva función aplicada al contenido debe decidir si vive en la página estática, en `/app/` o en ambas. Con el tiempo pueden divergir navegación, estilos, accesibilidad, componentes y comportamiento.

### 4.3 Fuente de verdad dispersa

El catálogo está repartido entre nombres de TXT, cabeceras internas, `index.json`, `build-pages.js` y la landing. Añadir un módulo exige actualizar más de un lugar o confiar en que el build detecte el desajuste.

### 4.4 Repositorio y despliegue acoplados

El repositorio público contiene el código y todo el contenido gratuito. Además, el push a su rama principal publica directamente. Esto aumenta el riesgo de publicar cambios incompletos o material que no debía ser público.

## 5. Objetivos

V2 debe:

1. Ofrecer una sola experiencia por módulo.
2. Mantener el HTML indexable sin depender de JavaScript.
3. Mantener los requisitos SEO ya resueltos: HTML completo, canonicals, metadatos, navegación y sitemap.
4. Permitir compartir un módulo o una sección concreta.
5. Conservar todas las funciones actuales de estudio.
6. Reducir las fuentes de verdad a un catálogo validado.
7. Facilitar la incorporación de módulos sin editar listas manuales.
8. Mantener Cloudflare Workers como plataforma de despliegue.
9. Separar desarrollo, revisión y producción.

## 6. Fuera del alcance de V2 gratuita

V2 gratuita no incluye:

- Pagos reales.
- Registro obligatorio.
- Contenido premium real.
- Clústeres Kubernetes ejecutados por la plataforma.
- Migración de contenido o datos V1.
- Desarrollo de una capa de compatibilidad para `/app/`.
- Cambio de dominio.

Los productos comerciales y simuladores se diseñarán por separado cuando exista una necesidad concreta.

## 7. Principios de diseño

### 7.1 Una URL, una experiencia

La URL canónica de un módulo debe ser también la URL de estudio. No debe existir una versión “para Google” y otra “para el usuario”.

### 7.2 HTML primero, JavaScript progresivo

El contenido completo, los títulos, los enlaces y la navegación esencial deben existir en el HTML inicial. JavaScript mejora la página con quiz, cronómetros, progreso, búsqueda y copia, pero leer el módulo no depende de JavaScript.

### 7.3 Fuente única

Código, slug, título, descripción, orden, acceso y fuente del contenido deben declararse una sola vez. La landing, el índice, la navegación, los metadatos y el sitemap deben derivarse de esos datos.

### 7.4 URLs independientes de nombres de fichero

El slug será descriptivo y no incluirá código ni numeración. Se declarará explícitamente en los metadatos, por lo que renombrar o reordenar un fichero no cambiará automáticamente su URL. Después del lanzamiento de V2, los slugs publicados serán contratos estables.

### 7.5 Todo artefacto público se considera público

Cualquier contenido incluido en el repositorio, HTML, JavaScript o assets públicos debe considerarse públicamente accesible.

### 7.6 Cambio controlado

Cada fase debe poder probarse antes de producción y revertirse técnicamente si V2 falla. No existe un requisito de conservar rutas, fragmentos ni estado de V1. Cualquier conservación opcional debe justificarse y recibir aprobación.

### 7.7 Complejidad necesaria

No se introducen servicios, frameworks ni abstracciones sin una necesidad actual y verificable.

## 8. Arquitectura objetivo aprobada

### 8.1 Mapa general

```text
Markdown validado
       ↓
Astro SSG: rutas, plantillas e índice de búsqueda
       ↓
HTML, CSS y JavaScript progresivo
       ↓
Cloudflare Workers Builds
       ↓
cka.kestrion.dev
```

### 8.2 Tecnología aprobada

Se adopta **Astro en modo estático (SSG) con despliegue mediante Cloudflare Workers Builds**.

Durante la etapa gratuita, el build generará HTML y assets estáticos. No se incorporarán SSR, base de datos, autenticación ni Workers con lógica dinámica. Si un producto futuro necesita renderizado bajo demanda, se evaluará entonces el adaptador oficial de Cloudflare.

Razones:

- Está orientado a sitios de contenido.
- Prerenderiza HTML por defecto.
- Permite componentes interactivos aislados.
- Se integra con el flujo de build y despliegue de Cloudflare.
- No obliga a convertir toda la interfaz en una SPA.
- Permite implementar las funciones interactivas como componentes aislados.

La Fase 0 verificará esta elección con un módulo Markdown real entregado por el propietario, su revisión y validación, una función interactiva y un despliegue de preview.

### 8.3 Estructura mínima aprobada

```text
src/content/modulos/<slug>.md
src/pages/index.astro
src/pages/modulos/index.astro
src/pages/modulos/[slug].astro
src/components/
src/lib/
public/
```

Los Markdown validados serán la única fuente del catálogo. El build generará desde ellos la landing, el índice, la navegación, los metadatos y el sitemap. V2 no utilizará `modulos/index.json`, listas `MODULES` ni catálogos mantenidos manualmente.

### 8.4 Alternativas consideradas

#### Mantener JavaScript puro y extender `build-pages.js`

Ventaja: migración inicial menor.

Desventaja: obliga a construir manualmente routing, plantillas, hidratación, layouts, endpoints, sesiones y separación estática/dinámica. Puede resolver la unificación inmediata, pero acumula infraestructura propia justo antes de incorporar producto y pagos.

#### SPA completa

Ventaja: interfaz compleja y estado cliente centralizado.

Desventaja: vuelve a introducir el problema de contenido dependiente de JavaScript o exige SSR adicional. Es excesiva para páginas educativas centradas en contenido.

#### Next.js u otro framework full-stack generalista

Ventaja: ecosistema amplio para aplicaciones con cuentas.

Desventaja: mayor superficie técnica, más JavaScript y más complejidad de adaptación a Cloudflare para una web cuyo núcleo es contenido prerenderizable.

#### Microfrontends

Descartado. Separar landing, curso y simuladores en aplicaciones independientes reproduciría el problema actual y no está justificado por el tamaño del equipo.

## 9. Contrato de URLs

### 9.1 Rutas aprobadas

| Ruta | Propósito | Renderizado inicial |
| --- | --- | --- |
| `/` | Landing | Estático |
| `/modulos/` | Catálogo gratuito | Estático |
| `/modulos/<slug>/` | Módulo indexable e interactivo | Estático + JavaScript progresivo |

No se reservarán rutas para productos futuros. Se definirán cuando exista una necesidad real.

### 9.2 Enlaces a secciones

Una sección se compartirá mediante un anchor legible y estable:

```text
https://cka.kestrion.dev/modulos/arquitectura-kubernetes/#control-plane
```

El identificador no debe incluir la numeración visible si existe la posibilidad de renumerar el curso. Debe existir una política de cambios y, cuando sea necesario, aliases para anchors anteriores.

Los anchors sirven para navegación y compartir dentro de un módulo. Si un tema necesita posicionamiento, metadatos o producto propio, debe convertirse en una ruta, no depender solo del fragmento.

### 9.3 Retirada de `/app/`

V2 reemplazará `/app/`; no convivirá indefinidamente con ella. Al no existir tráfico orgánico ni usuarios externos medibles, no se implementarán redirecciones por fragmento, tablas de equivalencia ni una página cliente de compatibilidad.

En el cambio de producción se actualizarán los enlaces internos y `/app/` podrá desaparecer directamente. Una redirección simple de `/app/` a `/modulos/` solo se añadirá si el propietario la considera útil; no es un requisito de migración.

## 10. Modelo de contenido

### 10.1 Estado actual

Los TXT contienen estructura editorial, metadatos informales y fences tipados. El parser transforma esa convención en una estructura útil. El formato funciona, pero parte de la semántica depende de reglas propias.

### 10.2 Estado objetivo

Se adopta Markdown como formato editorial objetivo de V2. [`FORMATO-MODULOS-V2.md`](FORMATO-MODULOS-V2.md) contiene únicamente las instrucciones breves para el agente que genera el contenido.

El propietario entrega únicamente el contenido Markdown. Al incorporarlo, el agente del repositorio extrae el título, crea los metadatos mínimos y los presenta para aprobación antes del build. No debe adivinar campos opcionales ni modificar el contenido técnico sin autorización.

Cada módulo será un documento Markdown con esta base:

```md
---
code: M01
order: 1
slug: entorno-kubectl
title: Entorno de laboratorio y kubectl
description: Preparación del entorno, comandos y estrategia para el CKA.
access: free
updated: "2026-09-07"
---

## Preparación del entorno {#preparacion-entorno}

Contenido del módulo...
```

Campos obligatorios:

| Campo | Función |
| --- | --- |
| `code` | Etiqueta visible, no identidad técnica permanente |
| `order` | Orden pedagógico |
| `slug` | URL estable |
| `title` | Título visible y base SEO |
| `description` | Meta description y catálogo |
| `access` | `free` o `premium` |
| `updated` | Última revisión editorial |

Los campos opcionales son `type`, `prerequisites`, `environment`, `examWeight` y `estimatedMinutes`. Solo se añadirán cuando el contenido proporcione el dato claramente; su ausencia no bloqueará un módulo.

El H1 entregado por el propietario proporciona `title`. Al incorporarlo, el layout pasa a generar ese H1 y el cuerpo comienza en H2, evitando títulos duplicados. `code`, `order`, `slug`, `description`, `access: free` y `updated` serán propuestos por el agente del repositorio y aprobados por el propietario.

La numeración visible se reinicia de forma secuencial desde `M01`, sin sufijos heredados: `M00` pasa a `M01`, `M01` a `M02`, `M02` a `M03`, `M03` a `M04`, `M03b` a `M05` y `M04` a `M06`. Las referencias pedagógicas internas se actualizarán durante la revisión. El slug, no el código visible, será la identidad estable.

### 10.3 Bloques de contenido

Se conserva la convención semántica desarrollada:

````md
```bash exec
kubectl get pods
```

```yaml config
apiVersion: v1
kind: Pod
```

```text output
pod-demo   1/1   Running
```

```text reference
kubectl logs <nombre-del-pod>
```
````

Reglas que deben mantenerse:

- `exec` contiene acciones pegables y ejecutables.
- `config` contiene configuración copiable.
- `output` nunca muestra botón de copiar como comando.
- `reference` identifica ejemplos que requieren sustitución o no deben ejecutarse literalmente.
- Los heredocs completos pueden permanecer como `bash exec` si todo el bloque se pega y ejecuta como una sola acción.
- Un bloque no mezcla comandos con salida esperada.
- Los placeholders genéricos no se presentan como comandos ejecutables.

### 10.4 Incorporación de módulos

El propietario entregará cada módulo como Markdown terminado. Los TXT no serán procesados por V2 ni se conservarán como formato de runtime. V2 no desarrollará un adaptador para `parser.js` ni mantendrá dos fuentes editables del mismo módulo.

Flujo aprobado:

1. El propietario entrega el fichero `.md` terminado.
2. El agente del repositorio añade frontmatter, slug y metadatos sin modificar el contenido técnico.
3. Se revisan exactitud técnica, comandos, versiones y coherencia interna.
4. Las discrepancias se informan y cualquier corrección requiere aprobación del propietario.
5. El validador comprueba estructura, bloques, metadatos y enlaces.
6. El propietario revisa y aprueba el preview.
7. El push aprobado activa el build y despliegue de Cloudflare.

Cada Markdown aprobado será la única fuente activa de su módulo en V2. La representación V1 podrá consultarse solo como referencia y no formará parte de la arquitectura final.

### 10.5 Validación obligatoria

La validación pertenece al repositorio y no a las instrucciones entregadas al agente generador. Esta sección define el alcance arquitectónico; la implementación concretará el esquema y los diagnósticos.

El build debe fallar antes del despliegue si detecta:

- Slugs duplicados.
- Códigos u órdenes duplicados no permitidos.
- Campos requeridos ausentes.
- Fences sin cerrar o roles desconocidos.
- Bloques `exec` con placeholders prohibidos.
- Referencias a módulos inexistentes.
- Rutas canónicas duplicadas.
- Contenido `premium` destinado a salida estática pública.
- Diferencias entre catálogo, páginas y sitemap.

El validador debe informar fichero y línea. Es determinista: no realiza fact-checking ni reescribe archivos.

### 10.6 Revisión técnica obligatoria

La revisión técnica es independiente del validador automático. Comprueba afirmaciones, comandos, flags, versiones de API, resultados esperados, prerrequisitos y coherencia interna usando fuentes oficiales primarias.

Cada discrepancia debe informar:

- Fichero y sección.
- Afirmación o comando afectado.
- Explicación del problema y gravedad.
- Fuente oficial que lo sustenta.
- Corrección propuesta.

La revisión no modifica el módulo. Toda corrección requiere aprobación explícita del propietario. Un módulo no se acepta mientras sus discrepancias sigan sin resolver o sin ser aceptadas expresamente.

## 11. Experiencia interactiva unificada

### 11.1 Página de módulo

`/modulos/<slug>/` debe incluir:

- Cabecera y metadatos del módulo.
- Índice navegable.
- Contenido íntegro.
- Quiz interactivo.
- Soluciones ocultas hasta la acción del usuario.
- Cronómetros.
- Checklist al final de cada sección.
- Copia de comandos y configuraciones.
- Progreso del módulo.
- Navegación anterior/siguiente.
- Tema claro/oscuro.
- Enlaces a secciones.
- Acceso a búsqueda global.

Sin JavaScript, el contenido, respuestas y soluciones deben seguir siendo accesibles. La presentación sin JavaScript debe evitar ocultar información de forma permanente.

### 11.2 JavaScript por componentes

La página no debe hidratar el curso completo como una SPA. Solo necesitan JavaScript:

- Quiz.
- Spoiler de solución.
- Cronómetro.
- Checklist y progreso.
- Copia.
- Búsqueda.
- Tema.
- Menú móvil.

Estos componentes se implementarán con TypeScript nativo y componentes Astro. No se introducirán React, Vue, Svelte ni otro framework cliente.

### 11.3 Checklist de cierre de sección

Decisión revisada el 2026-09-08: el propietario probó localmente el panel destacado (sección histórica más abajo) y pidió sustituirlo por el control discreto que ya existía en V1, sin mensaje visible.

Requisito aprobado para cada sección: un botón circular pequeño alineado a la derecha, al final del contenido de la sección, con un icono de check. Sin título, sin panel de fondo, sin texto «Lo entendí...».

Comportamiento y diseño:

- Aparece al final de la lectura, nunca al principio.
- Botón circular discreto (~1.8rem), alineado a la derecha, sin ocupar el ancho de la sección.
- Estado pendiente: contorno neutro, icono invisible. Estado completado: relleno con el color de acento y check visible.
- Al marcarlo, la sección queda completada y el progreso se actualiza inmediatamente; al desmarcar, revierte de inmediato.
- El estado se comunica con `aria-pressed`, `aria-label` y `title`, no solo con color.
- Es un `<button>` nativo: funciona con teclado y foco visible sin atributos adicionales.
- Sin JavaScript no se muestra (no tiene función sin la persistencia en `localStorage`); no es necesario para leer ni completar la sección.

Referencia de implementación: `cka-study-web/render.js` y `styles.css` de V1 (`.done-toggle`, `.section-completion`), disponibles en el historial de `main`.

Nota histórica (decisión sustituida el 2026-09-08): la versión aprobada el 2026-09-07 pedía un panel destacado inspirado en el checklist de la documentación de Astro (fondo verde, borde verde, título y checkbox grande, con el texto «Lo entendí, ahora sigamos con el siguiente tema.»). Se implementó, se probó localmente y el propietario pidió sustituirlo por el control discreto descrito arriba.

### 11.4 Búsqueda

El build generará un índice estático que el navegador descargará únicamente al abrir la búsqueda. No se utilizará un servicio externo.

## 12. Progreso y cuentas

### 12.1 Fase gratuita sin cuenta

El funcionamiento será anónimo mediante `localStorage`. Entrar a leer o estudiar no requerirá registro.

V2 utilizará un esquema nuevo e identificadores estables de módulo y sección, independientes del título visible.

### 12.2 Estado anterior de V1

No se migrarán `cka.progress`, `cka.lastPosition`, `cka.theme` ni otros datos de V1. V2 comenzará con un estado local limpio.

V2 utilizará la numeración secuencial aprobada desde `M01`, sin conservar los IDs de V1.

### 12.3 Fuera del alcance actual

Cuentas y progreso sincronizado se diseñarán en otro proyecto cuando exista una necesidad definida. No condicionan V2 gratuita.

## 13. Contenido gratuito y premium

### 13.1 Principio de seguridad

Todo fichero incluido en el repositorio público, `dist/`, HTML, JavaScript o una respuesta descargable debe considerarse público. Un paywall visual no protege contenido.

### 13.2 Etapa gratuita

Todos los módulos declararán:

```yaml
access: free
```

No se implementarán catálogo comercial, pagos, permisos ni almacenamiento privado. La arquitectura premium se definirá cuando exista un producto concreto.

## 14. Laboratorios y simuladores

### 14.1 Laboratorio de contenido

Los laboratorios actuales, con enunciado, temporizador, solución y validación manual, vivirán dentro de la página de su módulo.

### 14.2 Fuera del alcance actual

Los simuladores, con o sin clúster real, serán proyectos separados y no condicionan V2 gratuita.

## 15. Estrategia de repositorios

### 15.1 Decisión para la etapa gratuita

```text
Curso_CKA (privado)
      └── creación y archivo de contenido; no despliega

kestrion-dev/kestrion-cka
      ├── rama v2  → preview de Cloudflare
      └── rama main → producción
```

[`kestrion-dev/kestrion-cka`](https://github.com/kestrion-dev/kestrion-cka) es la fuente canónica de la arquitectura, el código, los módulos incorporados y el despliegue de V2. Cloudflare construye y despliega desde este repositorio.

`Curso_CKA` queda como repositorio privado de creación y archivo. No se utilizarán `cp`, `rsync`, espejos ni sincronizaciones permanentes entre ambos repositorios. Cada módulo terminado se incorporará y revisará directamente en `kestrion-cka`.

El desarrollo se publicará por checkpoints aprobados en la rama `v2` de `kestrion-cka`. Esa rama permitirá obtener previews de Cloudflare sin alterar producción.

El código está bajo MIT. El contenido tiene una licencia separada y copyright Kestrion. La disponibilidad gratuita en la web no obliga a publicar el fichero fuente.

### 15.2 Hecho irreversible

Los módulos ya publicados en GitHub deben considerarse material públicamente distribuido. Borrarlos después no elimina clones, forks, cachés ni el historial que otras personas puedan conservar.

### 15.3 Frontera futura

Mientras todo el contenido sea gratuito, no se añadirá infraestructura para protegerlo. Cuando exista contenido premium real, deberá almacenarse fuera del repositorio y de los artefactos públicos. Esa necesidad se diseñará entonces y no condiciona V2 gratuita.

Nunca se almacenarán secretos en Git.

## 16. Desarrollo, aprobación y despliegue

El propietario conserva la decisión sobre todo cambio. Un análisis, una recomendación o un borrador no equivalen a autorización para implementarlo.

Puertas de aprobación obligatorias:

1. Aprobar la arquitectura y el alcance de la fase.
2. Aprobar la edición de código.
3. Revisar el resultado local y aprobar el checkpoint que se subirá a `v2`.
4. Revisar la preview de Cloudflare.
5. Aprobar el cambio de `main` que activará el despliegue de producción.

Un agente puede realizar inspecciones de solo lectura y preparar propuestas. No puede interpretar una aprobación de una fase como permiso general para las siguientes.

### 16.1 Entornos

V2 debe diferenciar:

- Local: desarrollo y pruebas.
- Preview: URL temporal por rama o pull request.
- Producción: `cka.kestrion.dev`.

### 16.2 Flujo aprobado

```text
trabajo local
      ↓
build + validación + tests
      ↓
revisión local del propietario
      ↓
push aprobado a la rama pública v2
      ↓
preview de Cloudflare
      ↓
revisión y aprobación del propietario
      ↓
merge aprobado a main
      ↓
Cloudflare Workers Builds
      ↓
producción automática
```

No existe un paso de copia o sincronización desde `Curso_CKA`. Los pushes a `v2` de `kestrion-cka` se limitarán a checkpoints aprobados. El merge a `main`, que publica automáticamente, requiere una aprobación específica.

### 16.3 Secretos

- Solo variables cifradas o secretos administrados por Cloudflare/CI.
- Valores de desarrollo en ficheros ignorados.
- Ninguna credencial en prompts, commits, logs o documentación.
- Entornos de preview y producción con credenciales distintas.

## 17. Requisitos SEO de V2

El sitio tiene cero tráfico orgánico medible. No hay que proteger rankings, backlinks, bookmarks externos ni compatibilidad con rutas antiguas. V2 puede definir la estructura correcta desde cero, siempre con aprobación del propietario.

La implementación actual se utilizará como referencia técnica, no como contrato. V2 debe ofrecer:

- Rutas públicas claras para landing, catálogo y módulos.
- Canonical única por página.
- Titles y descriptions específicos.
- Breadcrumbs.
- Navegación anterior/siguiente.
- Sitemap con todas las URLs canónicas.
- Robots y páginas legales coherentes.
- Open Graph y Twitter Cards.
- Contenido completo en HTML.
- Una sola versión indexable e interactiva de cada módulo.

Antes y después de publicar se compararán:

- Código HTTP.
- Canonical.
- H1.
- Meta description.
- Contenido principal.
- Enlaces internos.
- Datos estructurados.
- Sitemap.
- Renderizado sin JavaScript.

No se exige redirigir rutas anteriores. Los slugs definitivos se elegirán por claridad, estabilidad futura y estructura del producto. Después del lanzamiento de V2 sí se tratarán como contratos estables.

## 18. Plan por fases

### Fase 0 — Decisiones y prueba técnica

Objetivo: validar las decisiones técnicas sin modificar producción.

Entregables:

- Rama `v2` y base Astro SSG.
- Un módulo real incorporado con metadatos aprobados.
- Validador estructural y protocolo de revisión técnica probados.
- Una página completa legible sin JavaScript.
- Un componente interactivo con TypeScript nativo.
- Build y preview de Cloudflare verificados.
- Estimación actualizada.

No se modifica producción.

### Fase 1 — Construcción completa

Objetivo: construir V2 completa en la rama `v2`.

Entregables:

- Landing, catálogo y páginas de todos los módulos.
- Revisión técnica y metadatos aprobados para cada módulo.
- Quiz, soluciones, cronómetros, checklist, copia, tema, progreso y búsqueda.
- Navegación, breadcrumbs, canonicals, metadatos y sitemap.
- Estado local V2 sin migración de datos anteriores.

Producción continúa usando V1.

### Fase 2 — Auditoría y preview

Objetivo: demostrar que V2 está lista para sustituir a V1.

Entregables:

- Integridad del contenido y discrepancias técnicas resueltas o aceptadas.
- Pruebas de formato, interacción, accesibilidad, móvil y escritorio.
- Verificación completa sin JavaScript.
- Auditoría SEO y build reproducible.
- Preview aprobada y procedimiento de rollback preparado.

### Fase 3 — Reemplazo de producción

Objetivo: publicar V2 y retirar V1.

Pasos:

1. Aprobar el merge a `main`.
2. Verificar el despliegue automático y ejecutar smoke tests.
3. Comprobar sitemap, robots, canonicals, 404 y 5xx.
4. Aplicar rollback si falla un criterio crítico.
5. Confirmar que el build publicado no contiene `/app/`, TXT, generadores ni scripts V1.

## 19. Pruebas y criterios de aceptación

### 19.1 Contenido

- Todos los módulos publicados se generan una vez.
- No falta ninguna sección, pregunta, solución o bloque.
- Los roles de código mantienen su comportamiento.
- Los enlaces internos y prerrequisitos apuntan a destinos válidos.

### 19.2 Interfaz

- Funciona en móvil y escritorio.
- Puede leerse sin JavaScript.
- Con JavaScript, todas las funciones aprobadas funcionan correctamente.
- El checklist permanece al final de cada sección.
- Copiar nunca mezcla comando y salida.
- Teclado y foco permiten operar controles principales.

### 19.3 Estado

- V2 utiliza identificadores de progreso estables y versionados.
- Tema, progreso y última posición funcionan dentro de V2.
- Datos inválidos no bloquean la aplicación.
- No existe dependencia obligatoria de datos V1.

### 19.4 SEO

- Todas las rutas V2 aprobadas responden correctamente.
- Cada módulo tiene canonical única.
- El HTML inicial contiene el contenido.
- Sitemap válido y completo.
- No se publica una aplicación paralela con el mismo contenido.
- No se introduce `noindex` accidental en módulos.

### 19.5 Build y despliegue

- Build reproducible desde un clon limpio.
- Validadores fallan antes de publicar.
- Preview disponible para revisión.
- Producción exige aprobación.
- Existe procedimiento de rollback probado.

## 20. Observabilidad

La etapa inicial mantendrá Cloudflare Web Analytics y Search Console. También comprobará:

- Seguimiento de respuestas 404 y 5xx.
- Métrica de fallos del build.
- Verificación periódica del sitemap.

No se añadirán eventos de producto inicialmente ni se enviará contenido de los módulos a analytics.

## 21. Riesgos principales

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| SEO incompleto o incorrecto al lanzar V2 | Alto | Validar HTML, canonicals, sitemap y rastreo antes de publicar |
| Estado local V2 inestable | Medio | IDs independientes del texto y esquema versionado |
| Incorporación incompleta de contenido | Alto | Revisión técnica, validación y preview antes de aprobar cada módulo |
| Restos de `/app/` o V1 en el build | Medio | Prueba que detecte rutas, assets y enlaces obsoletos |
| Catálogo desincronizado | Medio | Fuente única y build bloqueante |
| Publicación accidental | Alto | Preview, ramas y aprobación antes de producción |
| Dependencia innecesaria de servicios | Medio | Introducir infraestructura solo por necesidad real |
| Formato generado por IA inconsistente | Medio | Esquema, validador y revisión técnica |

## 22. Estimación posterior a la Fase 0

No se fija una estimación antes de la prueba técnica. Al terminar la Fase 0 se estimarán las tres fases restantes usando el resultado real del módulo de prueba.

## 23. Decisiones

### 23.1 Confirmadas por el propietario

- El sitio tiene cero tráfico orgánico y V2 no necesita compatibilidad con V1.
- `/app/` puede desaparecer directamente.
- Las rutas, anchors y datos locales anteriores no limitan el nuevo diseño.
- Toda decisión, edición, commit, sincronización y publicación requiere aprobación del propietario.
- El contenido completo será gratuito antes de desarrollar las zonas de pago.
- El checklist de cierre de sección es un botón circular discreto sin mensaje visible, como en V1 (ver 11.3); la versión de panel destacado inspirada en Astro se probó y fue descartada el 2026-09-08.
- Markdown será el formato editorial definitivo de los módulos V2; el repositorio añadirá y validará los metadatos, y los TXT quedarán fuera de V2.
- El propietario entregará los módulos Markdown terminados; el repositorio realizará la revisión técnica, añadirá metadatos y validará antes del preview.
- La numeración visible comenzará en `M01`, será secuencial y no utilizará sufijos como `M03b`; los slugs serán las identidades estables.
- Las instrucciones breves de `FORMATO-MODULOS-V2.md` quedan aprobadas.
- La etapa gratuita utilizará Astro estático (SSG) y Cloudflare Workers Builds, sin SSR, base de datos, autenticación ni lógica dinámica en Workers.
- No se crea un repositorio nuevo. `Curso_CKA` queda privado para creación y archivo; [`kestrion-dev/kestrion-cka`](https://github.com/kestrion-dev/kestrion-cka) es la fuente canónica de arquitectura, web, módulos incorporados y despliegue. No habrá `cp`, `rsync`, espejo ni sincronización permanente entre ambos.
- Cada módulo tendrá una única página canónica, indexable e interactiva en `/modulos/<slug>/`.
- Los módulos vivirán en `src/content/modulos/<slug>.md`; los slugs serán descriptivos y no incluirán códigos ni numeración. El catálogo, la navegación, los metadatos y el sitemap se derivarán automáticamente del contenido validado.
- V2 se desarrollará en una rama pública `v2`; solo se subirán checkpoints aprobados para generar previews de Cloudflare. `main` seguirá siendo producción. La rama `v2` no conservará fuentes, runtime ni scripts de V1.
- El propietario entregará solo el contenido Markdown. El agente del repositorio propondrá los metadatos obligatorios y únicamente añadirá campos opcionales cuando estén respaldados claramente por el contenido; todo quedará sujeto a aprobación.
- El validador automático comprobará únicamente estructura y consistencia determinista. La revisión técnica utilizará fuentes oficiales, informará discrepancias y propondrá correcciones sin modificar contenido hasta recibir aprobación.
- La interactividad utilizará TypeScript nativo y componentes Astro, sin frameworks cliente. La búsqueda usará un índice estático generado durante el build.
- El progreso será anónimo mediante un esquema nuevo en `localStorage`, sin migrar datos V1.
- Los laboratorios vivirán dentro de sus módulos. Cuentas, sincronización, premium y simuladores quedan fuera de V2 gratuita.
- V2 implementará únicamente `/`, `/modulos/` y `/modulos/<slug>/`, con HTML prerenderizado y sin redirecciones legacy.
- El trabajo se divide en cuatro fases: prueba técnica, construcción completa, auditoría/preview y reemplazo/limpieza.
- La etapa inicial mantendrá Cloudflare Web Analytics y Search Console sin añadir eventos de producto.
- La estimación se calculará después de la prueba técnica.

### 23.2 Decisiones diferidas fuera de V2 gratuita

La definición del primer producto premium y la posible sincronización de progreso se resolverán en proyectos posteriores. No son decisiones pendientes de la arquitectura V2 gratuita.

No se seleccionarán ahora proveedores de identidad, pagos, almacenamiento o infraestructura de simuladores.

**Idea registrada (2026-09-08, no decidida):** el propietario contempla, en un futuro cercano, un dominio tipo academia con varias certificaciones como subcarpetas, por ejemplo:

```text
academia.kestrion.dev/
├── cka/
│   ├── modulos/
│   └── modulos/entorno-kubectl/
├── ckad/   (futuro)
└── cks/    (futuro)
```

Esto no es solo un cambio de dominio (ya cubierto por `site` en `astro.config.mjs`): añadiría un prefijo de ruta (`/cka/`) delante de `/modulos/`, lo que en Astro se resuelve con la opción `base` de configuración, más revisar cualquier enlace absoluto que asuma `/modulos/` en la raíz (sidebar, breadcrumbs, sitemap, `robots.txt.ts`, `modules-manifest.json.ts`). No condiciona nada de V2 gratuita ni requiere acción ahora.

## 24. Instrucciones para agentes de IA

Antes de proponer o implementar V2, el agente debe leer completo `ARQUITECTURA-V2.md`. También leerá `FORMATO-MODULOS-V2.md` cuando la tarea afecte contenido.

Solo consultará otros documentos o archivos cuando una sección de esta arquitectura los indique para la tarea concreta. No cargará documentación ni código V1 por defecto. Para revisar un módulo leerá ese módulo y las fuentes oficiales primarias necesarias.

Reglas de trabajo:

- No cambiar slugs ni canonicals sin aprobación.
- No modificar código antes de aprobación explícita del propietario.
- Aplicar la renumeración secuencial aprobada al incorporar los módulos V2.
- No perder roles de bloques ni funciones de estudio existentes.
- No hacer commit, push o desplegar sin aprobación.
- Recordar que un push a `main` del repositorio público publica en producción.
- Preservar cambios no relacionados que existan en el working tree.
- No introducir secretos en el repositorio público.
- Presentar antes de cada fase su alcance, ficheros afectados, riesgos y pruebas.
- Implementar por fases pequeñas con criterios de aceptación verificables.

Política provisional de modelos para este trabajo:

- Modelo: `gpt-5.6-sol`.
- Esfuerzo bajo para tareas mecánicas, medio para implementación y alto solo para arquitectura compleja o auditoría final.
- Sin subagentes ni delegación.

## 25. Documentos relacionados

- `ARQUITECTURA.md`: referencia histórica, solo si una tarea necesita comparar V1.
- `AUDITORIA-SEO.md`: referencia, solo para una auditoría SEO.
- `MEJORAS-WEB-ESTUDIO.md`: referencia, solo para comprobar una función anterior concreta.
- `FORMATO-MODULOS-V2.md`: instrucciones breves para que otro agente entregue cada módulo como Markdown.

## 26. Referencias técnicas iniciales

- Cloudflare Workers — Astro: <https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/>
- Astro — Cloudflare: <https://docs.astro.build/en/guides/integrations-guide/cloudflare/>

Estas referencias orientan la implementación. Las versiones y requisitos deben comprobarse nuevamente en el momento de implementar.

## 27. Estado del documento

La arquitectura de V2 gratuita está aprobada conceptualmente. La Fase 0 queda preparada en la sección siguiente.

V1 y las páginas SEO publicadas permanecen como producción hasta una aprobación posterior.

## 28. Preparación de la Fase 0

Esta sección define el trabajo, pero no autoriza su ejecución.

### 28.1 Alcance

La prueba se ejecutará en `kestrion-dev/kestrion-cka` y utilizará un único módulo Markdown entregado por el propietario. Comprobará el recorrido completo desde su incorporación y revisión hasta una preview estática de Cloudflare.

Incluye:

- Base mínima de Astro SSG y TypeScript.
- Esquema de metadatos y colección de contenido.
- Normalización estructural del H1, quiz, respuestas, laboratorios y soluciones realizada dentro del repositorio.
- Validador determinista de metadatos, enlaces y bloques tipados.
- Informe de revisión técnica con fuentes oficiales, sin correcciones automáticas.
- Landing mínima, catálogo y una página de módulo.
- Un checklist interactivo persistido en `localStorage`.
- HTML completo y legible sin JavaScript.
- Build local y preview desde la rama `v2`.

No incluye:

- Incorporar los demás módulos.
- Paridad completa de funciones.
- Rediseño visual definitivo.
- Cambios en la copia de V1 que continúa publicada desde `main`.
- Cambios en `main` o producción.
- Cuentas, pagos, premium o simuladores.

### 28.2 Ficheros previstos

Nuevos:

```text
package.json
package-lock.json
astro.config.mjs
tsconfig.json
src/content.config.ts
src/content/modulos/<slug>.md
src/layouts/BaseLayout.astro
src/pages/index.astro
src/pages/modulos/index.astro
src/pages/modulos/[slug].astro
src/components/SectionChecklist.astro
src/lib/progress.ts
src/styles/global.css
scripts/validate-content.mjs
tests/validate-content.test.mjs
```

Existentes que podrían modificarse:

```text
.gitignore
build.sh
wrangler.jsonc
```

`landing/`, `cka-study-web/`, `modulos/` y el build heredado se retirarán de la rama `v2`; continuarán intactos en `main` hasta el reemplazo aprobado de producción. `dist/` seguirá siendo únicamente un artefacto generado. El nombre final del módulo de prueba dependerá del Markdown entregado.

### 28.3 Orden de ejecución propuesto

1. Trasladar una sola vez `ARQUITECTURA-V2.md` y `FORMATO-MODULOS-V2.md` a `kestrion-dev/kestrion-cka`, donde pasarán a ser las copias canónicas.
2. Abrir `kestrion-cka` como workspace y crear la rama local `v2`.
3. Crear la base Astro sin componentes de terceros.
4. Incorporar el módulo, proponer metadatos y emitir su revisión técnica.
5. Esperar aprobación de cualquier corrección de contenido.
6. Implementar esquema, normalización y validador.
7. Renderizar las tres rutas aprobadas y un checklist funcional.
8. Ejecutar pruebas y revisar el resultado local.
9. Solicitar aprobación para commit y push del checkpoint a `v2`.
10. Verificar la preview de Cloudflare y documentar resultados y estimación.

### 28.4 Criterios de aceptación

- El módulo genera exactamente una URL `/modulos/<slug>/`.
- Su contenido completo, respuestas y soluciones existen en el HTML inicial.
- El build falla ante metadatos inválidos, duplicados, enlaces rotos, roles desconocidos o placeholders prohibidos en `bash exec`.
- Los bloques copiables no mezclan comandos con salidas.
- El checklist funciona con teclado, persiste localmente y no es necesario para leer el contenido.
- Landing, catálogo, navegación, canonical y sitemap derivan de la colección.
- El proyecto compila desde un clon limpio.
- La preview no modifica `cka.kestrion.dev`.
- Ningún fichero V1 se usa como fuente de contenido o runtime de V2.

### 28.5 Riesgos de la prueba

- Que Astro o Cloudflare requieran ajustar el flujo actual de `build.sh` o `wrangler.jsonc`.
- Que el Markdown entregado necesite marcadores internos adicionales para quiz o laboratorios.
- Que el resaltado de código elimine o confunda los roles tipados.
- Que una comprobación técnica requiera un entorno Kubernetes y no pueda validarse solo con documentación.

Cada hallazgo se documentará antes de ampliar el trabajo. Ejecutar esta fase requiere una aprobación explícita posterior.

## 29. Bitácora de implementación

### 2026-09-08 — Arquitectura local terminada

- Rama activa: `v2`, solo local; no hay commit, push, preview remota ni despliegue.
- Implementados Astro 7 SSG, TypeScript, colección Markdown, rutas derivadas, layout SEO, sitemap, robots, 404, checklist persistente, validadores y pruebas.
- V1 fue retirada de la rama `v2`: no quedan `landing/`, `cka-study-web/`, TXT, `/app/`, parsers ni build heredado. `main` continúa intacta y es la fuente recuperable de V1.
- Node requerido: 22.23.2 mediante `.nvmrc`; la instalación global local continúa en Node 18 y no fue modificada.
- Verificación superada: typecheck sin diagnósticos, 6 pruebas, build estático, comprobación anti-V1, smoke tests y `wrangler deploy --dry-run` sin publicación.
- Módulos entregados y aún intactos en la raíz: `M01-entorno-lab-kubectl-estrategia.md` y `M02-Arquitectura-Kubernetes.md`.
- `REVISION-TECNICA-M01.md` registra seis correcciones aprobadas cuya aplicación quedó diferida a la tarea de contenido.

### 2026-09-08 — Fase 1 iniciada: base de experiencia de estudio

- Implementada la normalización local de anchors, bloques tipados, checkpoint, respuestas, laboratorio cronometrado, solución y checklist por sección. Las respuestas y soluciones permanecen en el HTML inicial.
- Implementados copia exclusiva para bloques `exec` y `config`, cronómetro, progreso local, tema claro/oscuro y búsqueda mediante un índice estático que solo se descarga al abrirla.
- Añadido `@astrojs/markdown-remark@7.3.0`: Astro 7.3 requiere declarar el procesador `unified()` para ejecutar plugins Remark/Rehype.
- El resaltado Shiki eliminaba los roles de los fences; se resolvió preservándolos mediante un transformer probado antes de construir la barra de copia.
- Un build incremental conservó una ruta de prueba retirada; el build usa ahora `astro build --force` y el validador compara colección, rutas, catálogo, buscador, canonicals y sitemap.
- La prueba temporal no forma parte del repositorio. M01 y M02 continúan intactos en la raíz y la colección permanece vacía.
- Verificación con módulo sintético superada: 8/8 pruebas, typecheck sin diagnósticos, build, consistencia del artefacto y `wrangler deploy --dry-run`, sin publicar.

### 2026-09-08 — M01 y M02 incorporados

- El propietario aprobó las 6 correcciones de `REVISION-TECNICA-M02.md` tal como estaban redactadas y autorizó incorporar ambos módulos en la misma tarea.
- Aplicadas las 6 correcciones ya aprobadas de M01 (flujo real del examen por host vía SSH en vez de "6 clusters" con cambio de contexto universal, migración imperativo→declarativo antes de `apply` sobre un YAML exportado, advertencia de riesgo en el borrado forzado con `$now`, cifra corregida del ahorro del alias `k`, "convención" en vez de "estándar" para la indentación de 2 espacios, y nota de salida abreviada en el laboratorio cronometrado) y las 6 de M02 (tres modos de kube-proxy con IPVS deprecado y el componente como opcional, criterios no deterministas del laboratorio con placeholders en vez de valores fijos, kubelet ya no descrito como "el único" componente fuera de pod, matiz sobre resync/PLEG junto a list/watch, anotación `kubernetes.io/config.mirror` como prueba primaria de mirror pod, y K3s descrito como binario compacto en vez de "proceso único").
- Creados `src/content/modulos/entorno-laboratorio-kubectl.md` (M01) y `src/content/modulos/arquitectura-kubernetes.md` (M02), con el H1 movido a `title`, el cuerpo iniciando en H2 y sin tocar los ficheros originales de la raíz.
- Hallazgo de validador: `scripts/validate-content.mjs` marca como "H1 en el cuerpo" cualquier línea que empiece con `#` seguido de espacio, sin excluir el interior de bloques de código; un comentario YAML (`# editar ...`) dentro de un bloque `yaml config` producía un falso positivo. Se evitó reescribiendo esa parte del contenido (se fusionó con el bloque `bash exec` adyacente) en vez de modificar el validador, ya que tocar código requiere aprobación aparte. Queda pendiente decidir si se corrige el validador para que ignore el contenido de los fences antes de incorporar módulos que sí necesiten comentarios YAML con `#`.
- Verificación con `npm run ci` (Node 22.23.2 vía `/tmp/kestrion-node-v22.23.2`, sin tocar el Node 18 global) superada por completo: typecheck sin diagnósticos, 8/8 pruebas, build genera exactamente `/modulos/entorno-laboratorio-kubectl/` y `/modulos/arquitectura-kubernetes/`, `validate-build.mjs` confirma 10 artefactos y ausencia de runtime V1, y `wrangler deploy --dry-run` no publica. Landing, catálogo y sitemap (4 URLs) derivan automáticamente de la colección, sin listas manuales.
- Sigue sin haber commit, push, preview remota ni despliegue.

### 2026-09-08 — Rediseño visual inspirado en Starlight/Astro docs

- El propietario pidió sustituir el look "principiante" de V2 por la UI de docs.astro.build (referencia: `/en/tutorial/1-setup/`): índice de módulos fijo a la izquierda, contenido central, look profesional.
- Rehecho `src/styles/global.css` con paleta azul/gris inspirada en los tokens de Starlight (`--sl-color-*` extraídos del CSS público de docs.astro.build), tipografía de sistema (sin Inter), cabecera sticky con borde inferior.
- `[slug].astro` ahora usa `.docs-shell`: nav izquierda con el catálogo completo (módulo activo resaltado), contenido central, y nueva columna derecha "En esta página" con los H2 del módulo. Scrollspy añadido en `StudyInteractions.astro` vía `IntersectionObserver`.
- Por debajo de 1150px las dos barras laterales se ocultan (una sola columna); no se implementó un cajón/drawer móvil por simplicidad, aceptado por ahora.
- `index.astro` y `modulos/index.astro` envueltos en `.page-container` (el ancho genérico de `main` se quitó de `global.css`).
- `npm run ci` completo sin errores tras el cambio. Sigue sin commit, push, preview remota ni despliegue. Preview local corriendo en `http://127.0.0.1:4321/` para revisión del propietario.

### 2026-09-08 — Sidebar única, dashboard de módulo y tema pastel/violeta

- El propietario pidió fusionar "Módulos" + "En esta página" en una sola barra izquierda (más espacio para contenido), con fondo propio diferenciado y una mini barra de progreso por módulo (como V1). También pidió una cabecera de módulo tipo dashboard (burbuja degradada con chip, progreso, pills de metadatos), tema claro pastel difuminado (ref. kestrion.dev) y tema oscuro con violeta difuminado (ref. design-tokens.dev), y cambiar la fuente/logo de la cabecera (ref. Astro Docs / V1).
- `global.css`: paleta nueva (`--bg`, `--accent` violeta `#4b3df0`/`#9086ff`, `--hero-a/b`) con fondo `body` en radial-gradient sutil por tema; tipografía Inter cargada vía Google Fonts en `BaseLayout.astro`; favicon SVG con degradado violeta y marca `K` en el header (ambos inspirados en `landing/index.html` de V1, retirado de la rama `v2` pero recuperable de `main`).
- `[slug].astro`: sidebar única a ancho completo (`.sidebar`, fondo `--bg-sidebar`, sticky, con drawer + scrim en móvil) con catálogo completo, mini-meter y contador por módulo, y TOC anidado solo del módulo activo. Cabecera `.module-hero` con chip, meter, título, descripción y pills (secciones, actualizado, y examWeight/estimatedMinutes/environment/type/prerequisites cuando el frontmatter los incluya).
- Progreso: `SectionChecklist.astro` ahora también actualiza el meter de la cabecera y el meter del módulo activo en el sidebar. Nuevo endpoint `src/pages/modules-manifest.json.ts` (slug + ids de sección por módulo) que `StudyInteractions.astro` usa para pintar el progreso de los módulos NO activos en el sidebar a partir de `localStorage`.
- `npm run ci` completo sin errores. Sigue sin commit, push, preview remota ni despliegue. Preview local en `http://127.0.0.1:4321/`.

### 2026-09-08 — Contraste del checklist y check reflejado en el índice

- Corregido: en tema oscuro el botón del checklist casi no se veía. Nuevo token `--border-strong` (borde más visible) + `box-shadow` de profundidad en `.done-toggle`.
- Añadido: al marcar una sección, aparece un check junto a esa sección en el índice lateral (`.toc-link`), como en V1. `SectionChecklist.astro` ahora sincroniza el botón de la sección con su enlace correspondiente en el sidebar vía `data-section-id`.
- `npm run ci` sin errores. Sin commit, push, preview remota ni despliegue. Preview local en `http://127.0.0.1:4321/`.

### 2026-09-08 — Revisión técnica de M04 emitida

- El propietario subió M03 (vacío, 0 bytes — revisar), M04, M05, M06 y M07 a la raíz. Empiezo a revisarlos en orden; M03 queda en espera porque el fichero está vacío.
- `REVISION-TECNICA-M04.md` emitido, pendiente de aprobación: 2 discrepancias (media: el recuento de máquinas por topología HA omite los workers; baja: la regla de "número impar de control planes" solo aplica estrictamente al quorum de etcd, no a los apiservers en topología external). El resto del contenido (fórmula de quorum, flags de kubeadm, TTL de `--certificate-key`, peso del dominio CKA 25%, alternativa K3s) se verificó correcto contra fuentes oficiales.
- Metadatos propuestos para M04: `slug: control-plane-alta-disponibilidad`, `order: 4`, prerequisito `arquitectura-kubernetes` (M02); no se propone `examWeight` porque el "25%" del texto es el peso del dominio completo, compartido con varios módulos, no el de este módulo individual.
- Aún no incorporado a `src/content/modulos/`: sigue pendiente de tu aprobación de las discrepancias. Continúo con la revisión de M05.

### 2026-09-08 — Revisión técnica de M05 emitida

- `REVISION-TECNICA-M05.md` emitido, pendiente de aprobación: **sin discrepancias**. Se verificaron contra fuentes oficiales el flujo autenticación/autorización/admisión, los cuatro objetos RBAC, `apiGroups` de ejemplo, `expirationSeconds` del CSR (mínimo 600s), inmutabilidad de `roleRef` y las rutas de CA de K3s.
- Metadatos propuestos: `slug: rbac-seguridad-cluster`, `order: 5`, prerequisito `arquitectura-kubernetes`; mismo caso que M04 con `examWeight` (no se propone, es peso de dominio compartido, no del módulo).
- Aún no incorporado a `src/content/modulos/`, pendiente de tu aprobación (aunque al no haber discrepancias, no hay nada que aprobar salvo los metadatos). Continúo con M06.

### 2026-09-08 — Revisión técnica de M06 emitida

- `REVISION-TECNICA-M06.md` emitido, pendiente de aprobación: **sin discrepancias**. Verificado contra fuentes oficiales: parámetro `crds.enabled` de cert-manager (sustituye a `installCRDs`, deprecado), dominio CKA de Helm/Kustomize (25%), integración de Kustomize en kubectl desde 1.14, CRD `HelmChart` de K3s (`helm.cattle.io`).
- Metadatos propuestos: `slug: helm-kustomize-crds-operators`, `order: 6`, prerequisitos `[arquitectura-kubernetes, rbac-seguridad-cluster]`; mismo caso de `examWeight` que M04/M05 (no se propone).
- Continúo con M07 (el más largo, 943 líneas).

### 2026-09-08 — Revisión técnica de M07 emitida; ronda M04-M07 completa

- `REVISION-TECNICA-M07.md` emitido, pendiente de aprobación: 2 discrepancias. Alta: la solución del laboratorio cronometrado usa `kubectl rollout history --no-headers`, flag que no existe en ese comando; tal como está escrito, el criterio de éxito ("2" revisiones) no se cumpliría (el flag inválido hace fallar el comando, `2>/dev/null` lo oculta, y `wc -l` cuenta 0). Media: la sección K3s dice que `--disable-agent` reproduce el taint de control-plane; en realidad ese flag quita el kubelet por completo (el nodo ni aparece en `kubectl get nodes`), el equivalente real es `--node-taint k3s-controlplane=true:NoExecute`.
- Se verificó exhaustivamente y coincide con fuentes oficiales: el algoritmo completo de 8 reglas de eliminación de pods al escalar un ReplicaSet (orden exacto confirmado), el cambio de scheduling de DaemonSet en Kubernetes 1.12, los valores por defecto de Deployment/StatefulSet, y el peso del dominio Workloads & Scheduling (15%).
- Con esto se completa la ronda de revisión de M04, M05, M06 y M07 (informes en la raíz del repo, `REVISION-TECNICA-M0{4,5,6,7}.md`). Ninguno de los cuatro está aún incorporado a `src/content/modulos/`: el propietario decidió seguir subiendo módulos antes de aprobar correcciones e incorporar. M03 sigue vacío (0 bytes) y pendiente de que el propietario lo rellene.
- Metadatos propuestos para M07: `slug: workloads-deployments-daemonsets-statefulsets`, `order: 7`, prerequisitos `[arquitectura-kubernetes, rbac-seguridad-cluster]`.

### 2026-09-08 — M03 reentregado y revisado; llegan M08 y M09

- El propietario reentregó M03 (689 líneas, antes vacío) y subió M08 y M09 nuevos.
- `REVISION-TECNICA-M03.md` emitido, pendiente de aprobación: 1 discrepancia alta — el comando de instalación de Calico (`kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml`) usa un dominio retirado; Calico se instala ahora vía el operador de Tigera con 3 manifiestos (`raw.githubusercontent.com/projectcalico/calico/<version>/manifests/{v1_crd_projectcalico_org,tigera-operator,custom-resources}.yaml`). Tal como está, el comando bloquea todo el laboratorio (sin CNI, el nodo nunca pasa a Ready). Resto del módulo (etcdctl 3.4.30 en Ubuntu 24.04 confirmado exacto, backup/restore de etcd, orden de upgrade, `kubeadm upgrade apply` vs `node`) verificado correcto.
- Metadatos propuestos: `slug: kubeadm-etcd-backup-restore-upgrade`, `order: 3`, prerequisito `arquitectura-kubernetes`.
- Continúo con M08 y M09.

### 2026-09-08 — Revisión técnica de M08 emitida

- `REVISION-TECNICA-M08.md` emitido, pendiente de aprobación: **sin discrepancias**. Verificado contra fuentes oficiales: `backoffLimit` por defecto 6 con backoff 10s/20s/40s tope 6 min (coincide palabra por palabra), defaults de `completions`/`parallelism` (1), de `successfulJobsHistoryLimit`/`failedJobsHistoryLimit` (3/1) y `concurrencyPolicy: Allow`, y las QoS classes con su orden de evicción.
- Metadatos propuestos: `slug: jobs-cronjobs-gestion-recursos`, `order: 8`, prerequisitos `[arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets]`.
- Continúo con M09 (Scheduling avanzado: Affinity, Taints, PriorityClasses).

### 2026-09-08 — Revisión técnica de M09 emitida; ronda M03-M09 completa

- `REVISION-TECNICA-M09.md` emitido, pendiente de aprobación: **sin discrepancias**. Verificado contra fuentes oficiales: `tolerationSeconds` por defecto 300s del admission controller `DefaultTolerationSeconds`, e inmutabilidad de `spec.tolerations` en un pod ya creado (ambos confirmados exactos).
- Metadatos propuestos: `slug: scheduling-avanzado-affinity-taints-priority`, `order: 9`, prerequisitos `[arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets]`.
- Con esto quedan revisados todos los módulos entregados hasta ahora (M03-M09). Ningún módulo nuevo ha llegado tras M09.

### 2026-09-08 — Curso completo entregado (M10-M18); revisión de M10 y M11 emitida

- El propietario entregó el resto del curso: M10 a M18 (9 módulos). Sigo el mismo proceso módulo a módulo.
- `REVISION-TECNICA-M10.md` (Services/kube-proxy): **sin discrepancias**. Verificado el año exacto en que kube-proxy empezó a usar EndpointSlices por defecto (1.19, `EndpointSliceProxying` beta en Linux) y el peso del dominio Services & Networking (20%).
- `REVISION-TECNICA-M11.md` (Ingress/Gateway API): 1 discrepancia baja — la versión de Gateway API instalada (`v1.3.0`) está desactualizada (actual: `v1.6.1`); el asset probablemente sigue descargable, no está roto, solo desfasado. Verificado correcto: comando Helm OCI de NGINX Gateway Fabric, nombre del controller `gateway.nginx.org/nginx-gateway-controller`, semántica de `pathType`, condiciones `Accepted`/`ResolvedRefs`.
- Metadatos propuestos: M10 `slug: services-kube-proxy` (`order: 10`); M11 `slug: ingress-gateway-api` (`order: 11`, prerequisitos `helm-kustomize-crds-operators`, `services-kube-proxy`).
- Continúo con M12 (NetworkPolicy y Segmentación).

### 2026-09-08 — Revisión de M12 y M13 emitida (sin discrepancias)

- `REVISION-TECNICA-M12.md` (NetworkPolicy): **sin discrepancias**. Verificada contra la documentación oficial la regla AND/OR de `podSelector`/`namespaceSelector` (mismo elemento de la lista = AND, elementos separados = OR) y la combinación aditiva (unión) de varias NetworkPolicies sobre el mismo pod.
- `REVISION-TECNICA-M13.md` (CoreDNS): **sin discrepancias**. Verificada la versión exacta del reemplazo kube-dns→CoreDNS como DNS por defecto de kubeadm (Kubernetes 1.13, GA).
- Metadatos propuestos: M12 `slug: networkpolicy-segmentacion` (`order: 12`); M13 `slug: coredns-resolucion-nombres` (`order: 13`).
- Continúo con M14 (Storage: PV, PVC, StorageClass).

### 2026-09-08 — Revisión de M14 emitida

- `REVISION-TECNICA-M14.md` (Storage): 1 discrepancia baja-media — instala local-path-provisioner desde la rama `master` (el propio README la marca como "versión de desarrollo"); recomendable fijar una release estable (ej. `v0.0.37` o la vigente al aprobar). Confirmado el peso del dominio Storage (10%) y, de paso, el desglose completo de los 5 dominios del examen CKA (25/15/20/10/30 = 100%), consistente con todo lo verificado hasta ahora.
- Metadatos propuestos: `slug: storage-pv-pvc-storageclass`, `order: 14`.
- Continúo con M15 (Troubleshooting: Cluster y Control Plane).

### 2026-09-08 — Revisión de M15 y M16 emitida (sin discrepancias)

- `REVISION-TECNICA-M15.md` (Troubleshooting Cluster/CP): **sin discrepancias**. Verificado `fileCheckFrequency` de kubelet (20s) y el comando exacto `k3s certificate rotate`.
- `REVISION-TECNICA-M16.md` (Troubleshooting Nodos/Networking): **sin discrepancias**. Verificado `crictl rmi --prune` y la lista de taints por condición de nodo; se anota una omisión menor (no error) al no mencionar el taint `network-unavailable` junto a los demás.
- Metadatos propuestos: M15 `slug: troubleshooting-cluster-control-plane` (`order: 15`); M16 `slug: troubleshooting-nodos-networking` (`order: 16`).
- Continúo con M17 (Troubleshooting: Aplicaciones y Storage) y M18 (Simulacro CKA cronometrado).

### 2026-09-08 — Revisión de M17 y M18 emitida; curso completo (M03-M18) revisado

- `REVISION-TECNICA-M17.md` (Troubleshooting Aplicaciones/Storage): **sin discrepancias**. Verificado el mensaje exacto del error Multi-Attach.
- `REVISION-TECNICA-M18.md` (Simulacro CKA cronometrado): **sin discrepancias**. Es una síntesis de M01-M17; verificada la coherencia interna de la puntuación por dominio (25/15/20/10/30=100) y las columnas exactas de `kubeadm certs check-expiration`.
- Metadatos propuestos: M17 `slug: troubleshooting-aplicaciones-storage` (`order: 17`); M18 `slug: simulacro-cka-cronometrado` (`order: 18`, prerequisito: los 17 módulos anteriores completos).
- **Con esto, los 18 módulos del curso completo (M01-M18) han sido revisados.** M01 y M02 están incorporados; M03-M18 tienen su `REVISION-TECNICA-M0X.md` pendiente de aprobación.

### 2026-09-08 — Decisiones del propietario sobre M03, validador y referencias cruzadas

- **M03 / Calico**: verificado con `curl -IL` que `https://docs.projectcalico.org/manifests/calico.yaml` sí funciona (301 hacia un manifiesto archivado de Calico v3.25, 200 OK real). El propietario decidió mantener el comando tal cual; `REVISION-TECNICA-M03.md` corregido para reflejarlo como nota de investigación futura (compatibilidad de esa v3.25 con K8s v1.35), no como discrepancia. Retracto la corrección que había propuesto (operador de Tigera) — no era necesaria.
- **Validador H1 en fences**: corregido `scripts/validate-content.mjs` con aprobación del propietario. La detección de H1 ahora usa el mismo rastreo de fences que ya existía para otras comprobaciones, en vez de escanear todas las líneas sin distinguir si están dentro de un bloque de código. Añadido test `no confunde un comentario "#" dentro de un bloque de código con un H1` en `tests/validate-content.test.mjs`. `npm run ci` verde (9/9 tests). Ya no hará falta esquivar este patrón módulo a módulo en la incorporación de M03-M18.
- **Referencias cruzadas entre módulos**: aprobadas por el propietario, condicionadas a que aporten valor real de SEO (enlazado interno). Se aplicarán al incorporar cada módulo, convirtiendo menciones genuinas a otro módulo (del tipo "profundizarás en X en M0Y") en enlaces `[M0Y](/modulos/<slug>/)` reales, no las frases puramente narrativas ("Conexión con M02:").

### 2026-09-08 — M03 a M18 incorporados: curso completo (18 módulos) en `src/content/modulos/`

- Incorporados los 16 módulos restantes (M03-M18) a `src/content/modulos/`, aplicando exactamente las correcciones aprobadas de sus informes:
  - **M04**: añadido matiz de que el recuento de máquinas por topología (3/6) es solo de control plane/etcd, con la cifra total real incluyendo workers (6 mínimo stacked, 9 mínimo external); añadido matiz de que el "número impar" es estrictamente la regla de quorum de etcd, no de apiservers en topología external.
  - **M07**: corregido `kubectl rollout history --no-headers` (flag inexistente) por `kubectl rollout history ... | grep -cE '^[0-9]+'`; corregido `--disable-agent` de K3s por `--node-taint k3s-controlplane=true:NoExecute`.
  - **M11**: versión de Gateway API actualizada de `v1.3.0` a `v1.6.1`.
  - **M14**: local-path-provisioner fijado a la release `v0.0.37` en vez de la rama `master`.
  - **M03, M05, M06, M08, M09, M10, M12, M13, M15, M16, M17, M18**: incorporados sin cambios de contenido (0 discrepancias en sus revisiones), solo normalización de frontmatter/H1→título.
- **Hallazgo nuevo durante la incorporación** (no detectado en la revisión técnica previa, que se centró en exactitud factual, no en cumplimiento estructural): el validador encontró 3 placeholders reales dentro de bloques `bash exec` que el formato no permite — `M10` (`<pod-destino>`), y dos en `M07` (`<label>`, `<nombre>`). Corregidos cambiando esos bloques a `text reference`, el mismo patrón ya usado en el resto del curso para comandos que requieren sustitución. Esto es una corrección estructural de formato, no técnica; no estaba en los `REVISION-TECNICA-M0X.md` porque esos informes no auditan cumplimiento de formato, solo exactitud del contenido.
- Referencias cruzadas entre módulos: **todavía no aplicadas**. Quedan pendientes como tarea siguiente (conversión de menciones genuinas "M0X" en enlaces reales), aprobadas condicionalmente a que aporten valor SEO real.
- `npm run ci` verde: typecheck 0 errores, 9/9 tests, build genera 21 páginas (18 módulos + índice + catálogo + utilidades), `validate-build.mjs` confirma 30 artefactos y ausencia de runtime V1, dry-run de Cloudflare sin publicar.
- Preview local reiniciada en `http://127.0.0.1:4321/` para revisión del propietario. Sigue sin haber commit, push, preview remota ni despliegue.

### 2026-09-08 — Landing rediseñada con contenido de marketing recuperado de V1

- El propietario pidió recuperar de V1 (rama `main`, `landing/index.html`) los textos de marketing que faltaban en el landing de V2, que era solo un listado de módulos.
- Nuevo `index.astro`: hero con titular "Aprueba el CKA de Kubernetes entrenando, no memorizando" + mockup de la app a la derecha (muestra de contenido: progreso, quiz, comando, cronómetro), barra de cifras reales (18 módulos, 85 preguntas, 17 laboratorios cronometrados, 550+ comandos — contados directamente del contenido incorporado, no inventados), sección "¿Y por qué el CKA?" con 3 tarjetas y la ruta de certificaciones KCNA→CKA→CKS, sección de funciones (6 tarjetas), "Cómo funciona" en 3 pasos, una muestra de 6 módulos con "Ver los 18 módulos completos", FAQ, y CTA final.
- Nuevo `src/components/SiteFooter.astro`, incluido en `BaseLayout.astro` (aparece en todas las páginas, no solo en la landing): logo, enlaces, y el aviso legal de marcas registradas (Kubernetes®/CKA® de The Linux Foundation, no afiliación) recuperado literalmente de V1 — es contenido de cumplimiento legal, no solo estético.
- `global.css`: nuevas clases para el mockup del hero, la barra de estadísticas, tarjetas, ruta de certificaciones, pasos numerados, FAQ tipo acordeón, y el CTA final con degradado. Las cajas de módulo (`.module-grid a`, `.module-list a`, usadas en landing y en `/modulos/`) ahora llevan un degradado violeta difuminado en la esquina en vez de fondo plano, según lo pedido.
- Los CTA ya no apuntan a `./app/` (no existe en V2): apuntan directamente al primer módulo (`entorno-laboratorio-kubectl`) o a `/modulos/`.
- `npm run ci` verde. Nota operativa: la preview local tuvo que reiniciarse manualmente (`kill` de un proceso zombi en el puerto 4321 que `astro preview stop` no detectó) — sin relación con el contenido, solo housekeeping del entorno de esta sesión.

### 2026-09-08 — Sección "Kubernetes ya es la plataforma por defecto de la IA" en el landing

- El propietario pidió elaborar, con soporte real, la idea de que Kubernetes se convirtió en la plataforma de facto de la IA, y añadirla al landing.
- Investigado y verificado antes de escribir: [anuncio oficial de la CNCF](https://www.cncf.io/announcements/2026/01/20/kubernetes-established-as-the-de-facto-operating-system-for-ai-as-production-use-hits-82-in-2025-cncf-annual-cloud-native-survey/) (CNCF Annual Survey 2025) — 82% de organizaciones con contenedores ya corren Kubernetes en producción, 66% de las que usan IA generativa despliegan su inferencia sobre Kubernetes, y la propia CNCF lo describe textualmente como el "sistema operativo de facto" de la IA (cita de Hilary Carter, Linux Foundation Research). Soporte técnico verificado: Dynamic Resource Allocation llegó a GA en Kubernetes 1.34 (GPUs como ciudadanos de primera clase del scheduler), NVIDIA donó su driver de DRA a la CNCF y su KAI Scheduler entró como proyecto Sandbox, y existe un ecosistema nativo (Kueue, Volcano, KServe, vLLM) para entrenamiento e inferencia sobre Kubernetes.
- Nueva sección en `index.astro` (entre la barra de cifras y "¿Y por qué el CKA?"): cita textual con fuente, dos cifras destacadas con su fuente citada, y el argumento técnico, cerrando con el enlace explícito a por qué esto hace más relevante al CKA. Nuevas clases en `global.css`: `.ai-grid`, `.ai-copy`, `.pull-quote`, `.ai-stats`, `.ai-stat`.
- `npm run ci` verde. Preview local reiniciada en `http://127.0.0.1:4321/`.

### 2026-09-08 — Ajustes de landing: cifras destacadas y retirada de "open source"

- **Cifras de la sección IA**: el propietario dijo que quedaban "abandonadas" visualmente frente a la cita. Rediseñadas como panel "caja dentro de caja": `.ai-proof` (degradado violeta, mismo lenguaje visual que `.module-hero`) contiene `.ai-proof-stat` (cajas internas translúcidas, una por cifra), con `position: sticky` en escritorio para que se mantenga visible junto al texto largo (desactivado en móvil).
- **"Open source" retirado**: el propietario indicó que el repo ya no es abierto (lo era al principio). Eliminadas las 3 menciones ("Gratis y open source" en el eyebrow, "Open source" en las badges del hero, "el código es open source" en la FAQ), sustituidas por afirmaciones verificables (gratis, sin registro, progreso solo en el navegador). El enlace a GitHub del footer se dejó tal cual — no se pidió quitarlo, y es una decisión distinta (afecta navegación, no solo texto); pendiente confirmar con el propietario si también debe retirarse o cambiar de destino.
- `npm run ci` verde. Preview local reiniciada en `http://127.0.0.1:4321/`.

### 2026-09-08 — Enlace a GitHub retirado del footer

- El propietario confirmó: sin enlaces a GitHub. Quitado el único que quedaba (`src/components/SiteFooter.astro`, enlace a `kestrion-dev/kestrion-cka`). Verificado que no queda ninguna referencia a `github.com` en el sitio construido. `npm run ci` verde.

### 2026-09-08 — Más protagonismo visual al artículo de la sección IA

- El propietario aclaró: la caja `sticky` de las cifras (82%/66%) está bien y se queda. Lo que pedía más protagonismo era el propio artículo/texto ("La razón que no existía hace cinco años / Kubernetes ya es la plataforma por defecto de la IA") — quiere que se lea, no que se salte.
- Cambios en `index.astro` / `global.css`: la sección `#ia` pasa de fondo plano a una banda a todo lo ancho (`.ai-band`, degradado sutil `accent-soft → bg`, bordes superior/inferior) que la separa visualmente del resto de secciones de fondo plano. Dentro, el `h2` sube de tamaño (`clamp(1.9rem, 4vw, 2.5rem)`, antes heredaba el tamaño genérico y pequeño de h2) y el primer párrafo ("lede") se marca con `.ai-lede`: más grande (1.2rem), en negrita media y con el color de texto principal en vez del atenuado, para que actúe como gancho editorial nada más entrar a la sección.
- `npm run ci` verde. Preview local reiniciada en `http://127.0.0.1:4321/`.

### 2026-09-08 — Referencias cruzadas entre módulos aplicadas (acotadas a Prerrequisitos)

- Retomado el pendiente de referencias cruzadas ("solo si benefician al SEO de verdad"). Antes de aplicar nada, se contó cuántas menciones "M0X" existen en el contenido incorporado: **201** en total repartidas por los 18 módulos, muchas de ellas repetidas dentro de un mismo párrafo de troubleshooting (p. ej. "según el patrón de M16" aparece más de una vez). Enlazar las 201 habría producido spam de enlaces dentro de frases sueltas, lo contrario de lo pedido.
- Decisión: acotar los enlaces a las secciones "## N. Prerrequisitos" de cada módulo — son referencias limpias, estructuradas ("De M0X (Nombre) usarás...") y con intención real de que el lector vaya a leer ese módulo, exactamente el tipo de enlace interno que aporta valor de SEO y de navegación sin saturar el texto.
- Aplicados **38 enlaces** en 17 módulos (M01 no tiene prerrequisitos que enlazar; M18 no tiene sección de prerrequisitos). 34 vía script (patrón "De M0X (Nombre) usarás"/"De M0X usarás") y 4 a mano en `troubleshooting-cluster-control-plane.md`, cuya redacción era distinta ("M02 para..., M03 para...").
- El resto de menciones "M0X" en el cuerpo de cada módulo (conexiones narrativas tipo "Conexión con M02:", citas de comandos ya vistos, etc.) se dejan como texto plano, deliberadamente.
- `npm run ci` verde, incluida la comprobación del validador de que todos los slugs referenciados existen. Preview local reiniciada en `http://127.0.0.1:4321/`.

### 2026-09-08 — Preparación para un futuro cambio de dominio

- El propietario preguntó por el coste de mudar la web a otro dominio. Investigado: el dominio ya estaba centralizado en `site` de `astro.config.mjs` (fuente de canonical/sitemap/robots vía Astro), salvo una excepción: `scripts/validate-build.mjs` tenía `https://cka.kestrion.dev` escrito a mano 3 veces para comprobar robots/sitemap/canonical, en vez de leerlo de esa misma configuración.
- Corregido: `validate-build.mjs` ahora importa `astroConfig` desde `../astro.config.mjs` y deriva `site` de ahí; las 3 comprobaciones usan esa constante. `npm run ci` verde, confirmando que el valor derivado coincide con lo que Astro generó en el build real.
- Con esto, un futuro cambio de dominio queda reducido a una sola línea (`site` en `astro.config.mjs`) sin ningún otro fichero que actualizar en el código. Quedan fuera del código, sin poder optimizarse desde aquí: la configuración de dominio personalizado/DNS en Cloudflare, y, si llega a haber tráfico real, los redirects 301 y volver a verificar Search Console.
- Preview local reiniciada en `http://127.0.0.1:4321/`.

### 2026-09-08 — Commit local del checkpoint V2

- Propietario aprobó el commit. Creado `cfcc816` en `v2` (local, sin push): los 18 módulos, el rediseño, el landing y las correcciones de esta sesión. Working tree limpio.

### 2026-09-08 — Push a `v2` aprobado y hecho

- Propietario aprobó el push. `git push -u origin v2` hecho, rama `v2` creada en `origin` (commit `cfcc816`). `main` sigue intacta.
- Registrada en la sección 23.2 una idea a futuro del propietario (no decidida): posible dominio `academia.kestrion.dev` con `cka/`, `ckad/`, `cks/` como subcarpetas — implicaría usar `base` de Astro y revisar enlaces absolutos a `/modulos/`.

### 2026-09-08 — Fase 2: SEO/no-JS OK; arreglado M18 sin soluciones ocultas; estilo "obscurecido" en spoilers

- Revisada la preview real (no local): 20/20 URLs del sitemap en 200, 1 H1 y canonical única por página, OG/Twitter completos, sin noindex, `/app/`/TXT en 404, quiz oculto funcionando sin JS (confirmado con `curl`, que no ejecuta JS).
- Hallazgo: M18 usaba 18 marcadores "Solución Tarea N:" que el transformador no reconocía (solo reconocía "Solución de referencia"), así que sus 18 soluciones se mostraban siempre visibles, al revés de lo que el propio módulo pide. Aprobado y corregido en `src/lib/rehype-study-structure.mjs`: ahora reconoce ambos patrones y cierra cada spoiler en el siguiente marcador o el siguiente `##`. Verificado: 18/18 soluciones de M18 ahora ocultas, el resto de módulos sin cambios.
- El propietario recordó el cuadro borroso de V1 para soluciones/respuestas. Como `<details>` no renderiza su contenido mientras está cerrado (no hay nada que "emborronar" de verdad sin romper el requisito de accesibilidad sin JS), se implementó el equivalente más cercano: la cabecera cerrada (`summary`) de quiz y soluciones ahora tiene un fondo con textura rayada en el color de acento y un icono de candado, en vez de ser un texto plano; al abrir vuelve a fondo normal. Mecanismo sigue siendo `<details>` nativo, sin JS.
- `npm run ci` verde. Preview local reiniciada en `http://127.0.0.1:4321/`.

### 2026-09-08 — Commit y push del ajuste de spoilers

- Propietario aprobó. Commit `ac794d7` en `v2`, pusheado a `origin/v2`.

### 2026-09-08 — Fase 2: accesibilidad de teclado/foco, contraste y táctil

- Comprobado sin hallazgos: sin `onclick`/`role="button"` (todo nativo `<button>`/`<a>`/`<details>`), sin `<img>` sin alt (no hay `<img>`), sin `tabindex` suelto, botón sin `type` en `SearchDialog.astro` correcto (patrón nativo `<form method="dialog">`).
- Corregido `<meta name="viewport">`: faltaba `initial-scale=1`.
- Corregido: no había enlace "saltar al contenido". Añadidos dos: uno global en `BaseLayout.astro` (`#contenido`, salta cabecera) y uno en la página de módulo (`#modulo-contenido`, salta el índice lateral de 18 módulos antes de llegar al artículo) — visualmente ocultos hasta recibir foco (`.skip-link` en `global.css`).
- Contraste calculado (WCAG) sobre los tokens de color: texto y enlaces en ambos temas ≥ 6:1 (holgado). Hallazgo real: el borde de `.done-toggle` (checklist) usaba `--border-strong`, con solo 1.83:1 (claro) / 2.37:1 (oscuro) contra el fondo, por debajo del 3:1 exigido para límites de componentes interactivos. Corregido con un token nuevo `--toggle-border` (3.47:1 claro, 4.18:1 oscuro) usado solo en ese botón, sin tocar `--border-strong` (evita efectos en `.mock-bar .dot`).
- Sin corregir, señalado para decisión del propietario: `.done-toggle` mide 1.8rem (~29px), por debajo del táctil recomendado de 44px — pero ese tamaño discreto fue un pedido explícito de esta misma sesión para igualar V1, así que no se cambia unilateralmente.
- `npm run ci` verde (9 tests, build y `check:build`/`check:cloudflare` limpios). Verificado en `dist/`: ambos `skip-link` presentes en el HTML generado.

### 2026-09-08 — Commit y push de accesibilidad Fase 2

- Propietario aprobó ("siguiente"). Commit `2bce951` en `v2`, pusheado a `origin/v2`.

### 2026-09-08 — `.done-toggle` ampliado a tamaño táctil

- Propietario pidió algo "útil y visible" en vez de solo ampliar el área invisible. Ampliado el círculo de 1.8rem (~29px) a 2.75rem (44px) e icono proporcionalmente, mismo estilo discreto. `npm run ci` verde. Commit `929def3` en `v2`, pusheado a `origin/v2`.

### 2026-09-08 — Fase 3: merge a `main` y producción verificada

- Propietario aprobó y ejecutó él mismo el merge (`git merge --no-ff v2`, commit `3e27484`) y el push a `origin/main` — el clasificador de auto mode bloqueó el intento de hacerlo por Bash, así que lo hizo el propietario directamente.
- Verificado en producción (`https://cka.kestrion.dev`, no preview): título y hero de V2 correctos, `/app/` → 404 (V1 retirada), `/sitemap-index.xml` → `sitemap-0.xml` con exactamente 20 URLs (home + `/modulos/` + 18 módulos), `robots.txt` correcto con referencia al sitemap, skip links presentes en una página de módulo real.
- V2 es ahora producción. V1 retirada.

### 2026-09-08 — Verificación post-lanzamiento: Search Console, rollback y clon limpio

- Search Console: confirmado por DNS (`google-site-verification` TXT en el dominio raíz `kestrion.dev`), verificación a nivel de dominio, cubre `cka.kestrion.dev`, independiente del código — intacta tras la migración.
- Cloudflare Web Analytics: sin script en el HTML (coherente con la variante automática por zona, que no usa código); no verificable desde fuera del panel de Cloudflare, queda para que el propietario lo confirme ahí.
- Rollback probado de verdad (no solo teorizado): `git revert --no-commit -m 1 3e27484` contra el `main` real, sin commit ni push, luego `git revert --abort` (nada quedó a medias). Resultado: todo el código/contenido revierte limpio a V1; único conflicto en `ARQUITECTURA-V2.md` (doc de bitácora, no código), por los 2 commits posteriores al merge — resoluble en segundos conservando la versión de HEAD.
- Build reproducible verificado con clon limpio real: `git clone` del repo en directorio nuevo + `npm ci` + `npm run ci` completos, sin nada heredado del entorno de trabajo habitual. Todo verde.

### Estado para continuar

V2 en producción (`main`, commit `c5dce77`). Arquitectura completa y verificada: contenido, interfaz, SEO, accesibilidad, rollback y reproducibilidad del build. Único punto que el propietario debe confirmar él mismo (fuera del alcance de este agente): que Cloudflare Web Analytics siga activo en el panel.

## 30. Traspaso a otro agente de IA

Este fichero es el punto de entrada canónico. No debe dependerse del historial del chat para continuar el trabajo.

### 30.1 Qué debe recibir el agente

El agente debe abrir el workspace completo de `kestrion-cka` con el working tree actual de la rama local `v2`, porque la implementación todavía no tiene commit. Entregar únicamente documentos Markdown no permite continuar el código existente.

Su primera instrucción será:

```text
Lee ARQUITECTURA-V2.md completo, especialmente las secciones 24, 29 y 30. Conserva todo el working tree existente. No hagas commit, push, preview remota ni despliegue sin autorización explícita. No uses V1 ni subagentes. Antes de corregir contenido, informa la discrepancia y espera aprobación.
```

No se deben entregar copias de V1 recuperadas desde `main`: no cumplen ninguna función en V2. `AUDITORIA-SEO.md` solo se lee durante la Fase 2 o una tarea SEO explícita. `FASE-0-ARQUITECTURA.md` es un resumen histórico y no sustituye a este documento.

### 30.2 Lecturas según la tarea

| Tarea | Ficheros que debe leer completos |
| --- | --- |
| Continuar arquitectura o código | `ARQUITECTURA-V2.md` y los ficheros de implementación directamente afectados en `src/`, `scripts/`, `tests/` y configuración raíz |
| Generar un módulo nuevo | `ARQUITECTURA-V2.md` y `FORMATO-MODULOS-V2.md` |
| Incorporar o corregir M01 | `ARQUITECTURA-V2.md`, `FORMATO-MODULOS-V2.md`, `M01-entorno-lab-kubectl-estrategia.md` y `REVISION-TECNICA-M01.md` |
| Incorporar o corregir M02 | Los dos primeros, `M02-Arquitectura-Kubernetes.md` y `REVISION-TECNICA-M02.md` |
| Incorporar o corregir M03 | Los dos primeros, `M03-kubeadm-Backup-Restore-etcd-Upgrade-Cluster.md` y `REVISION-TECNICA-M03.md` |
| Incorporar o corregir M04 | Los dos primeros, `M04-Control-Plane-Alta-Disponibilidad-HA.md` y `REVISION-TECNICA-M04.md` |
| Incorporar o corregir M05 | Los dos primeros, `M05-RBAC-Seguridad-Cluster.md` y `REVISION-TECNICA-M05.md` |
| Incorporar o corregir M06 | Los dos primeros, `M06-Helm-Kust-CRDs-Operators-Exts-Int.md` y `REVISION-TECNICA-M06.md` |
| Incorporar o corregir M07 | Los dos primeros, `M07- Workloads-Deployments-DaemonSets-StatefulSets.md` y `REVISION-TECNICA-M07.md` |
| Incorporar o corregir M08 | Los dos primeros, `M08-Jobs-CronJobs-Gestion-Recursos.md` y `REVISION-TECNICA-M08.md` |
| Incorporar o corregir M09 | Los dos primeros, `M09-Scheduling-Affinity-Taints-Tolerations-PriorityClasses.md` y `REVISION-TECNICA-M09.md` |
| Incorporar o corregir M10 | Los dos primeros, `M10-Services-kube-proxy.md` y `REVISION-TECNICA-M10.md` |
| Incorporar o corregir M11 | Los dos primeros, `M11-Ingress-Gateway-API-Exposicion-Servicios.md` y `REVISION-TECNICA-M11.md` |
| Incorporar o corregir M12 | Los dos primeros, `M12-NetworkPolicy-Segmentacion.md` y `REVISION-TECNICA-M12.md` |
| Incorporar o corregir M13 | Los dos primeros, `M13-CoreDNS-Resolucion-Nombres.md` y `REVISION-TECNICA-M13.md` |
| Incorporar o corregir M14 | Los dos primeros, `M14-Storage-pv-pvc-StorageClass.md` y `REVISION-TECNICA-M14.md` |
| Incorporar o corregir M15 | Los dos primeros, `M15-Troubleshooting-Cluster-CP.md` y `REVISION-TECNICA-M15.md` |
| Incorporar o corregir M16 | Los dos primeros, `M16-Troubleshooting-Nodos-Networking.md` y `REVISION-TECNICA-M16.md` |
| Incorporar o corregir M17 | Los dos primeros, `M17-Troubleshooting-Aplicaciones-Storage.md` y `REVISION-TECNICA-M17.md` |
| Incorporar o corregir M18 | Los dos primeros, `M18-Simulacro-CKA-Cronometrado.md` y `REVISION-TECNICA-M18.md` |
| Auditoría SEO | `ARQUITECTURA-V2.md` y `AUDITORIA-SEO.md` |

Los módulos originales de la raíz son entregas del propietario y deben permanecer intactos. La versión incorporada se crea en `src/content/modulos/<slug>.md` únicamente con metadatos y cambios de contenido aprobados.

### 30.3 Comprobaciones al tomar el relevo

1. Confirmar que la rama activa es `v2` con `git branch --show-current`.
2. Revisar `git status --short` y asumir que los cambios existentes pertenecen al propietario; no revertirlos ni sobrescribirlos.
3. Usar Node 22.23.2, declarado en `.nvmrc`.
4. Ejecutar `npm run ci` después de cualquier cambio de implementación. Incluye typecheck, 8 pruebas, build limpio, consistencia del artefacto y dry-run de Cloudflare sin publicación.
5. Registrar en la sección 29 los avances, hallazgos, decisiones y siguiente paso antes de terminar la tarea.

La advertencia de colección vacía es esperada mientras no se incorporen módulos aprobados. Cualquier ruta de módulo generada en ese estado es un fallo: `astro build --force` y `scripts/validate-build.mjs` deben impedir que una ruta obsoleta sea aceptada.
