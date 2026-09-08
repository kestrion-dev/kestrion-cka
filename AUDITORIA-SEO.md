# Auditoría SEO de cka.kestrion.dev

Fecha de revisión: 5 de septiembre de 2026

## Resumen ejecutivo

`cka.kestrion.dev` tiene una base técnica correcta y un rendimiento muy bueno, pero prácticamente no tiene tráfico orgánico medible. En los últimos tres meses Google Search Console registró 20 impresiones y ningún clic para el subdominio. Cloudflare Web Analytics registró 20 visitas y 50 páginas vistas en 30 días; el propietario confirma que accede regularmente para estudiar el contenido, por lo que es razonable considerar que una parte importante, quizá la totalidad, corresponde a ese uso propio y no a audiencia adquirida.

El bloqueo principal no es la velocidad. Google solo dispone de dos URLs en el sitemap, la landing `/` y la aplicación `/app/`. La landing está indexada; `/app/` está descubierta pero nunca ha sido rastreada. Los seis módulos se cargan mediante JavaScript desde ficheros `.txt` y no tienen páginas HTML ni URLs indexables propias. Por tanto, Google no dispone de documentos específicos que pueda posicionar para búsquedas como «restore etcd CKA», «RBAC Kubernetes CKA» o «DaemonSet CKA».

## Datos observados

### Cloudflare Web Analytics — últimos 30 días

Filtros aplicados: `Host = cka.kestrion.dev` y `Exclude bots = Yes`.

| Métrica | Resultado |
| --- | ---: |
| Visitas | 20 |
| Páginas vistas | 50 |
| Páginas por visita | 2,5 |
| Tiempo de carga | 543 ms |
| `/app/` | 30 vistas |
| `/` | 20 vistas |
| Referente interno `cka.kestrion.dev` | 30 vistas |
| Directo/sin referente | 20 vistas |
| Suiza | 40 vistas |
| Turquía | 10 vistas |
| Chrome / Linux / Desktop | 50 vistas |
| Navegación normal | 40 vistas |
| Atrás/adelante | 10 vistas |

La muestra es pequeña y no aparece ningún referente externo. Que todas las vistas procedan de Chrome en Linux y escritorio coincide con el uso habitual del propietario para estudiar. No son pruebas técnicas, sino sesiones reales de estudio, pero tampoco representan adquisición de audiencia externa. `Exclude bots` reduce tráfico automatizado conocido, pero no excluye las visitas del propietario.

Cloudflare HTTP Traffic en el plan Free solo ofrece datos agregados para toda la zona `kestrion.dev`; no permite aislar este subdominio mediante filtros por host, ruta, código de estado o caché. Para este análisis, Web Analytics es la fuente útil.

### Rendimiento real

| Métrica | Resultado | Evaluación |
| --- | ---: | --- |
| Page load time | 543 ms | Muy bueno |
| LCP P50 | 504 ms | Bueno |
| LCP P75 | 872 ms | Bueno |
| LCP P90 | 872 ms | Bueno |
| LCP P99 | 872 ms | Bueno en la muestra disponible |
| Muestras LCP clasificadas como buenas | 100 % | Bueno |
| CLS | Clasificación verde | Falta valor numérico |
| INP | Sin datos | Tráfico/interacciones insuficientes |

No se justifica priorizar optimizaciones de velocidad antes que la arquitectura y el contenido indexable. Los percentiles se basan en muy pocas visitas y deben revisarse de nuevo cuando aumente el tráfico.

### Google Search Console — últimos tres meses

La propiedad de Search Console es de dominio y mezcla `kestrion.dev` con todos sus subdominios. Al aplicar el filtro `Página contiene https://cka.kestrion.dev/`, el resultado fue:

| Métrica | Resultado |
| --- | ---: |
| Clics | 0 |
| Impresiones | 20 |
| CTR | 0 % |
| Posición media | 6,2 |

La posición media no es estadísticamente significativa con solo 20 impresiones. Search Console mostró una única consulta:

| Consulta visible | Clics | Impresiones | CTR | Posición |
| --- | ---: | ---: | ---: | ---: |
| `kestrion` | 0 | 3 | 0 % | 4,0 |

Las consultas visibles solo explican 3 de las 20 impresiones. Search Console puede ocultar consultas de bajo volumen por privacidad; no debe interpretarse que las otras consultas no existen. Aun así, no hay evidencia suficiente de visibilidad para términos no relacionados con la marca.

La propiedad completa de `kestrion.dev` registró 326 impresiones, 2 clics, 0,6 % de CTR y posición media 50,6. Esos datos no corresponden al curso. Además, `kestrion.dev` publica en inglés y `cka.kestrion.dev` está dirigido a lectores en español, por lo que son audiencias distintas y no debe asumirse que los artículos del dominio principal sean un canal de adquisición adecuado.

### Estado de indexación

#### `https://cka.kestrion.dev/`

- Indexada en Google.
- Último rastreo: 22 de agosto de 2026 a las 19:38:13.
- Rastreador: Googlebot para smartphones.
- Rastreo e indexación permitidos.
- Obtención de página correcta.
- Canonical declarada: `https://cka.kestrion.dev/`.
- Canonical elegida por Google: la URL inspeccionada.
- Página de referencia detectada: `https://kestrion.dev/about/`.
- Servida mediante HTTPS.

#### `https://cka.kestrion.dev/app/`

- No indexada.
- Estado: «Descubierta: actualmente sin indexar».
- Descubierta mediante `https://cka.kestrion.dev/sitemap.xml`.
- Nunca rastreada; no hay fecha, obtención ni canonical seleccionada.
- Search Console no detectó una página de referencia, aunque el HTML actual de la landing sí contiene varios enlaces `<a href="./app/">`. El informe puede estar retrasado o ser incompleto.

No conviene solicitar la indexación de `/app/` antes de mejorar su HTML inicial o decidir que la aplicación sea una utilidad `noindex`. En su estado actual aporta poco contenido estático a un rastreador.

### Robots y sitemaps

`robots.txt` permite el rastreo general y declara correctamente el sitemap:

```text
User-agent: *
Allow: /

Sitemap: https://cka.kestrion.dev/sitemap.xml
```

Search Console confirmó el 5 de septiembre de 2026:

| Sitemap | Estado | Última lectura | URLs descubiertas |
| --- | --- | --- | ---: |
| `https://cka.kestrion.dev/sitemap.xml` | Correcto | 5 sep 2026 | 2 |
| `https://kestrion.dev/sitemap.xml` | Correcto | 27 jul 2026 | 10 |

El «error temporal de procesamiento» mostrado durante una inspección individual queda descartado por el informe de Sitemaps: el archivo fue leído correctamente. El problema es que solo declara `/` y `/app/`.

## Revisión técnica y de contenido

### Metadatos

La landing incluye correctamente:

- `title` descriptivo.
- Meta description.
- Canonical absoluta.
- Open Graph y Twitter Cards.
- Imagen social de 1200 × 630.
- Idioma `es`.
- Verificación de Google Search Console.

La meta description tiene 171 caracteres. No es un error técnico, pero Google puede truncarla o reescribirla; conviene reducirla y concentrar la propuesta de valor en unos 150–160 caracteres.

`/app/` tiene título y descripción, pero carece de canonical, Open Graph, Twitter Cards y datos estructurados propios. Su HTML inicial contiene principalmente la interfaz vacía; el índice y el contenido aparecen después de ejecutar JavaScript.

### Datos estructurados

La landing contiene JSON-LD de tipo `WebSite`, `Course` y `FAQPage`. El marcado describe contenido visible y su sintaxis general es coherente, pero su beneficio en Google es limitado:

- El resultado enriquecido de lista de cursos de Google exige al menos tres cursos y un `ItemList` con URLs únicas. El único objeto `Course` actual no hace que la página sea elegible para ese resultado.
- El objeto `Course` apunta a `/app/`, que no está indexada y cuyo HTML inicial no presenta el curso completo.
- Google restringe normalmente los resultados enriquecidos de `FAQPage` a sitios gubernamentales y sanitarios con autoridad. Mantener el marcado no penaliza, pero no debe considerarse una ventaja visible para este proyecto.
- Las futuras páginas de módulo se beneficiarían más de `BreadcrumbList` y de datos que describan exactamente el contenido visible en cada página.

### Arquitectura indexable

Actualmente existen seis ficheros de módulo:

1. M00 — Entorno, kubectl y estrategia de examen.
2. M01 — Arquitectura de Kubernetes.
3. M02 — Instalación y configuración con kubeadm.
4. M03 — RBAC y seguridad.
5. M03b — Helm, Kustomize, CRDs, Operators e interfaces.
6. M04 — Deployments, DaemonSets y StatefulSets.

Ninguno tiene una página HTML propia. La aplicación descarga los módulos desde `.txt`, construye el contenido mediante JavaScript y representa las secciones mediante fragmentos `#`. Los fragmentos no son documentos independientes para Google. Esto impide que cada tema acumule autoridad, enlaces, impresiones y clics por separado.

La arquitectura actual solo permite intentar posicionar dos documentos genéricos. Para captar búsquedas específicas hacen falta páginas estáticas o renderizadas en servidor con contenido útil presente en el HTML inicial.

### Landing desactualizada o imprecisa

La landing no coincide con el contenido real del repositorio:

- Muestra «4 módulos completos», pero existen seis ficheros de módulo.
- No presenta M03b.
- Presenta `M04+` como futuro, aunque M04 ya existe.
- Afirma que «el curso completo» es gratuito y que sigue el formato vigente del examen, mientras muestra Networking, almacenamiento y troubleshooting «en camino».
- Los dominios oficiales de Services & Networking, Storage y Troubleshooting representan conjuntamente el 60 % del examen CKA actual. La landing debe explicar con precisión qué está disponible y qué sigue en desarrollo.
- La afirmación de que la fecha de última actualización «siempre está visible en el repositorio» debe comprobarse o reemplazarse por una fecha/versionado visible y mantenible.

La Linux Foundation indica actualmente que el examen usa Kubernetes v1.35 y pondera los dominios así: Cluster Architecture 25 %, Workloads & Scheduling 15 %, Services & Networking 20 %, Storage 10 % y Troubleshooting 30 %. La landing debería mostrar explícitamente la versión del temario y el grado de cobertura.

### Hosting observado

Aunque inicialmente se describió como Cloudflare Pages, el repositorio y el panel muestran un servicio de Cloudflare Workers con assets estáticos:

- `wrangler.jsonc` declara `assets.directory = "./dist"`.
- El flujo documentado usa `npx wrangler deploy`.
- El panel muestra `kestrion-cka` bajo una ruta de servicio de Workers.

Esto no perjudica el SEO, pero conviene documentar el hosting real para evitar instrucciones operativas incorrectas. Cloudflare Web Analytics está activo aunque el beacon no aparezca en el código fuente del repositorio; los datos recibidos demuestran que la medición funciona y puede estar siendo inyectada en el edge.

## Backlog priorizado

Escala de esfuerzo: **XS** (menos de medio día), **S** (medio a un día), **M** (dos a cuatro días), **L** (cinco a diez días) y **XL** (más de diez días o trabajo continuo). El esfuerzo es orientativo y deberá ajustarse después de definir la implementación.

### P0 — Exactitud, confianza y decisiones bloqueantes

#### SEO-001 — Alinear la landing con los módulos disponibles

- **Impacto SEO:** alto. Elimina contradicciones que perjudican la confianza, la relevancia del contenido y la conversión desde búsqueda.
- **Esfuerzo:** S.
- **Archivos afectados:** `landing/index.html`; `modulos/index.json` solo como fuente de verificación.
- **Riesgo:** bajo. El principal riesgo es anunciar como terminado contenido todavía incompleto.
- **Criterio de verificación:** la cifra y lista visibles coinciden exactamente con `modulos/index.json`; aparecen M03b y M04; desaparece `M04+` como contenido futuro; una revisión visual confirma que escritorio y móvil mantienen el diseño.

#### SEO-002 — Mostrar estado, cobertura y versión del temario

- **Impacto SEO:** alto. Refuerza calidad y confianza y evita una promesa engañosa de curso completo o permanentemente actualizado.
- **Esfuerzo:** S.
- **Archivos afectados:** `landing/index.html`; opcionalmente `README.md` para mantener la misma declaración editorial.
- **Riesgo:** medio. Una versión o fecha fija puede volver a quedar obsoleta si no existe un proceso de actualización.
- **Criterio de verificación:** la landing indica qué módulos están disponibles, qué dominios faltan, la versión CKA/Kubernetes cubierta y una fecha de revisión comprobable; la información coincide con el temario oficial y con los módulos publicados.

#### SEO-003 — Afinar el snippet de la landing

- **Impacto SEO:** medio. Puede mejorar la claridad del resultado y el CTR cuando existan suficientes impresiones; no mejora rankings por sí solo.
- **Esfuerzo:** XS.
- **Archivos afectados:** `landing/index.html`.
- **Riesgo:** bajo. Google puede reescribir la descripción.
- **Criterio de verificación:** `title`, meta description, Open Graph y Twitter comunican la misma propuesta; la descripción se mantiene aproximadamente entre 150 y 160 caracteres e incluye CKA, español y el carácter gratuito/práctico sin afirmaciones no demostradas.

#### SEO-004 — Decidir el papel indexable de `/app/`

- **Impacto SEO:** muy alto. Evita invertir rastreo en una aplicación con poco HTML inicial o aplicar `noindex` antes de disponer de páginas sustitutas.
- **Esfuerzo:** S para la decisión; la implementación se estima aparte.
- **Archivos afectados:** `cka-study-web/index.html`, `landing/sitemap.xml`, `landing/index.html`, `build.sh` y futuras plantillas de módulos.
- **Riesgo:** alto si se implementa prematuramente. Retirar `/app/` del índice sin páginas de módulo reduciría aún más la superficie orgánica.
- **Criterio de verificación:** existe una decisión escrita entre: (a) convertir `/app/` en página indexable con contenido estático útil, o (b) tratarla como herramienta `noindex,follow` después de publicar páginas de módulo. Sitemap, canonical y enlaces deberán reflejar una sola estrategia coherente.

### P1 — Crear superficie indexable y enlazable

#### SEO-101 — Generar una página HTML por módulo

- **Impacto SEO:** muy alto. Es el cambio principal para captar búsquedas no asociadas a la marca.
- **Esfuerzo:** L.
- **Archivos afectados:** `build.sh`, `modulos/index.json`, los ficheros `modulos/*.txt`, una nueva plantilla o generador y las nuevas salidas bajo `dist/modulos/`.
- **Riesgo:** medio-alto. Pueden aparecer contenido duplicado, HTML incompleto, rutas rotas o diferencias entre la app y las páginas generadas.
- **Criterio de verificación:** existen seis URLs estables; cada una devuelve HTTP 200, contiene contenido sustancial en el HTML sin ejecutar JavaScript y representa fielmente su módulo. Las páginas funcionan con JavaScript deshabilitado y no duplican una canonical distinta.

Estructura inicial orientativa:

```text
/modulos/entorno-kubectl/
/modulos/arquitectura-kubernetes/
/modulos/kubeadm-instalacion-upgrade-etcd/
/modulos/rbac-seguridad-kubernetes/
/modulos/helm-kustomize-crds/
/modulos/deployments-daemonsets-statefulsets/
```

#### SEO-102 — Añadir SEO on-page y navegación entre módulos

- **Impacto SEO:** alto. Diferencia las intenciones de búsqueda y permite distribuir contexto y autoridad entre páginas.
- **Esfuerzo:** M.
- **Archivos afectados:** plantilla/generador de módulos, `landing/index.html` y posibles estilos compartidos.
- **Riesgo:** bajo-medio. Metadatos generados de forma demasiado mecánica pueden resultar repetitivos.
- **Criterio de verificación:** cada URL tiene `title`, meta description, H1 y canonical únicos; breadcrumbs visibles; enlaces anterior/siguiente; enlace a la app; y enlaces `<a href>` desde la landing. Ninguna navegación esencial depende de fragmentos o eventos JavaScript.

#### SEO-103 — Generar automáticamente el sitemap completo

- **Impacto SEO:** alto. Facilita el descubrimiento de todas las páginas publicadas y reduce desajustes entre contenido y sitemap.
- **Esfuerzo:** S.
- **Archivos afectados:** `build.sh`, `landing/sitemap.xml` o un nuevo generador de sitemap.
- **Riesgo:** medio. Un generador defectuoso puede publicar URLs inexistentes, duplicadas o no canónicas.
- **Criterio de verificación:** el sitemap es XML válido, contiene únicamente URLs canónicas con HTTP 200 e incluye todas las páginas de módulo. Search Console lo procesa sin errores y aumenta el número de URLs descubiertas.

#### SEO-104 — Implementar la estrategia acordada para `/app/`

- **Impacto SEO:** alto.
- **Esfuerzo:** M.
- **Archivos afectados:** `cka-study-web/index.html`, `landing/sitemap.xml`, `landing/index.html`, `build.sh` y, si procede, la plantilla de módulos.
- **Riesgo:** medio-alto por indexación accidental, duplicidad o pérdida temporal de señales.
- **Criterio de verificación:** si es indexable, `/app/` ofrece contenido estático útil, canonical propia, metadatos sociales y enlaces rastreables; si es herramienta, devuelve `noindex,follow`, queda fuera del sitemap y las páginas de módulo ya están publicadas e indexables.

#### SEO-105 — Simplificar y validar los datos estructurados

- **Impacto SEO:** medio. Ayuda a interpretar las páginas, aunque no garantiza resultados enriquecidos.
- **Esfuerzo:** S.
- **Archivos afectados:** `landing/index.html` y plantilla/generador de módulos.
- **Riesgo:** medio. Un marcado que no corresponda al contenido visible puede perder elegibilidad o generar acciones manuales.
- **Criterio de verificación:** Schema Markup Validator no informa de errores; el marcado describe solo contenido visible; se añade `BreadcrumbList` a páginas de módulo; `Course` no se presenta como elegible para el carrusel de Google salvo que se cumplan sus requisitos; `FAQPage` no se considera una fuente esperada de tráfico.

### P2 — Ampliar cobertura, autoridad y medición

#### SEO-201 — Completar los dominios de mayor peso del CKA

- **Impacto SEO:** muy alto a medio plazo. Amplía la demanda cubierta y hace creíble la propuesta de preparación integral.
- **Esfuerzo:** XL.
- **Archivos afectados:** nuevos `modulos/*.txt`, `modulos/index.json`, `landing/index.html`, sitemap y páginas generadas.
- **Riesgo:** alto. El contenido técnico inexacto o desactualizado dañaría a estudiantes y a la reputación del sitio.
- **Criterio de verificación:** una matriz contra el temario oficial cubre Services & Networking (20 %), Storage (10 %) y Troubleshooting (30 %); cada módulo tiene revisión técnica, prácticas verificables, versión declarada y página indexable.

#### SEO-202 — Crear contenidos orientados a búsquedas concretas en español

- **Impacto SEO:** alto a medio plazo.
- **Esfuerzo:** L y continuo.
- **Archivos afectados:** nuevas páginas o módulos, generador, navegación y sitemap.
- **Riesgo:** medio. Crear muchas páginas superficiales puede diluir la calidad y provocar canibalización.
- **Criterio de verificación:** cada página responde una intención diferenciada, contiene ejemplos originales y enlaza al módulo relacionado. Search Console empieza a mostrar consultas no asociadas a `kestrion`, por ejemplo etcd, kubeadm, RBAC, DaemonSet, NetworkPolicy o troubleshooting CKA.

#### SEO-203 — Conseguir descubrimiento y enlaces desde audiencias en español

- **Impacto SEO:** medio-alto. Puede aportar los primeros usuarios externos y señales de autoridad.
- **Esfuerzo:** M y continuo.
- **Archivos afectados:** ninguno necesariamente; podría requerir páginas de destino o material enlazable dentro del repositorio.
- **Riesgo:** medio. La promoción indiscriminada o enlaces artificiales pueden atraer audiencia irrelevante y perjudicar la reputación.
- **Criterio de verificación:** aparecen referentes externos relevantes, usuarios fuera del patrón propio y primeros clics orgánicos. Los enlaces proceden de comunidades, artículos o recursos relacionados con Kubernetes/CKA en español.

#### SEO-204 — Mantener separadas las audiencias inglesa y española

- **Impacto SEO:** medio. Reduce confusión de idioma e intención.
- **Esfuerzo:** S.
- **Archivos afectados:** ninguno en este repositorio salvo que se añada una explicación de marca; cualquier enlace desde `kestrion.dev` afectaría al repositorio de esa web.
- **Riesgo:** bajo-medio. Un enlace sin contexto puede tener poca conversión; eliminar toda relación puede desaprovechar una señal legítima de marca.
- **Criterio de verificación:** la estrategia del curso no depende de la audiencia inglesa. Cualquier enlace desde `kestrion.dev` está justificado por el tema y rotulado explícitamente como recurso en español.

#### SEO-205 — Establecer seguimiento mensual del subdominio

- **Impacto SEO:** medio indirecto. Permite distinguir crecimiento real de uso propio y decidir con datos.
- **Esfuerzo:** XS cada mes.
- **Archivos afectados:** `AUDITORIA-SEO.md` o un registro separado; configuración externa de Cloudflare y Search Console solo si se aprueba.
- **Riesgo:** bajo. El riesgo principal es tomar decisiones con muestras demasiado pequeñas.
- **Criterio de verificación:** se registran mensualmente URLs indexadas, clics, impresiones, consultas sin marca, páginas con tráfico, referentes externos y Core Web Vitals P75. Las sesiones directas de Chrome/Linux/Desktop se tratan como línea base probable del propietario.

#### SEO-206 — Corregir la documentación del hosting

- **Impacto SEO:** bajo y operativo. Evita aplicar instrucciones de Pages a un despliegue que actualmente se presenta como Workers Static Assets.
- **Esfuerzo:** XS.
- **Archivos afectados:** `README.md` y documentación de despliegue; `wrangler.jsonc` solo como fuente de verdad.
- **Riesgo:** bajo.
- **Criterio de verificación:** la documentación describe el servicio, build y despliegue actuales sin cambiar su comportamiento.

## Primer lote propuesto — mejoras rápidas

El primer lote agrupa **SEO-001, SEO-002 y SEO-003** y modifica únicamente `landing/index.html`:

1. Cambiar la cifra y lista de módulos para reflejar M00, M01, M02, M03, M03b y M04.
2. Eliminar o matizar las afirmaciones «curso completo» y «actualizado con el examen actual».
3. Mostrar estado del curso, cobertura pendiente, versión CKA/Kubernetes y fecha de revisión verificable.
4. Reducir la meta description y alinear Open Graph/Twitter con la descripción corregida.

- **Impacto esperado:** mejorar confianza, exactitud y conversión de las pocas impresiones actuales; evitar promocionar información contradictoria.
- **Esfuerzo total:** S, aproximadamente medio día.
- **Riesgo:** bajo; cambios de texto y metadatos en un único archivo.
- **Verificación del lote:** ejecutar el build local, validar que el HTML generado conserva title/canonical/JSON-LD, comprobar la landing en escritorio y móvil y confirmar que todo el texto coincide con `modulos/index.json` y el temario oficial.
- **Fuera de alcance:** no crear páginas de módulo, no cambiar `/app/`, sitemap, robots, analítica, hosting ni despliegue.

Este lote es solo una propuesta. No debe implementarse, publicarse ni enviarse a Google hasta recibir aprobación explícita.

## Objetivo de los próximos 90 días

El primer objetivo no debe ser una cifra arbitraria de visitas, sino pasar de una única landing visible a un conjunto pequeño de páginas útiles que Google rastree y pueda asociar con consultas específicas.

Indicadores de progreso:

- Todas las páginas de módulo publicadas, descubiertas e indexadas.
- Aparición de consultas no asociadas a `kestrion`.
- Primeros clics orgánicos hacia páginas temáticas, no solo hacia la home.
- Crecimiento sostenido de impresiones durante varias semanas.
- CTR medido por página y consulta, corrigiendo títulos/descripciones solo cuando haya muestra suficiente.
- Rendimiento P75 dentro de los umbrales buenos después de aumentar el tráfico.

## Orden de ejecución propuesto

1. Corregir la información desactualizada de la landing.
2. Definir URLs, plantilla y metadatos de las páginas de módulo.
3. Generar las seis primeras páginas indexables.
4. Actualizar enlaces internos, sitemap y tratamiento de `/app/`.
5. Validar HTML, canonicals, robots y datos estructurados.
6. Publicar y comprobar las URLs con Search Console.
7. Promocionar las páginas en canales y contenidos en español; enlazar desde `kestrion.dev` únicamente donde la diferencia de idioma quede clara y el contexto sea pertinente.
8. Medir durante 4–12 semanas antes de evaluar resultados.

## Fuentes

- [Cloudflare Zone Analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)
- [Cloudflare Web Analytics: filtros](https://developers.cloudflare.com/web-analytics/configuration-options/filters/)
- [Cloudflare Web Analytics: Core Web Vitals](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/)
- [Google: datos estructurados de Course](https://developers.google.com/search/docs/appearance/structured-data/course)
- [Google: cambios en FAQ rich results](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Google: conceptos básicos de SEO con JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Linux Foundation: CKA, dominios y competencias](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/)
- Datos de Cloudflare y Google Search Console proporcionados durante esta auditoría.

## Cambios realizados durante la auditoría

Solo se creó y actualizó este informe. No se modificó código ni configuración, no se realizaron commits y no se publicó ningún despliegue.
