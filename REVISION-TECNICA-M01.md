# Revisión técnica — M01

Fecha de revisión: 2026-09-07

Módulo revisado: `M01-entorno-lab-kubectl-estrategia.md`

Estado: correcciones aprobadas por el propietario; aplicación diferida a la tarea de contenido. Este informe no modifica el módulo.

## Metadatos propuestos

```yaml
code: M01
order: 1
slug: entorno-laboratorio-kubectl
title: Entorno de laboratorio, kubectl avanzado y estrategia de examen CKA
description: Prepara el entorno de laboratorio, domina kubectl imperativo y practica una estrategia eficiente para el examen CKA.
access: free
updated: "2026-09-07"
```

No se proponen campos opcionales. El entorno descrito necesita validación independiente y el contenido no proporciona una duración estimada.

## Discrepancias

### 1. Flujo actual del examen por hosts

- Ubicación: líneas 210, 221 y 337; secciones «Namespaces y contextos» y «Estrategia de tiempo».
- Gravedad: alta.
- Afirmación afectada: el examen usa seis clusters y cada pregunta comienza con un comando para cambiar de contexto.
- Problema: las instrucciones oficiales actuales indican que cada tarea designa un `host`, que el candidato entra mediante SSH y que debe ejecutar `exit` al terminar para volver al sistema `base`. No documentan seis clusters ni un cambio de contexto al inicio de todas las tareas.
- Corrección propuesta: explicar primero el flujo `base → ssh <host> → tarea → exit`; conservar contextos y namespaces como conocimientos operativos, sin presentarlos como el mecanismo universal de selección de tarea. Eliminar «6 clusters» de las líneas 5, 210 y 337.
- Fuente: [Important Instructions: CKA and CKAD — Linux Foundation](https://docs.linuxfoundation.org/tc-docs/certification/tips-cka-and-ckad).

### 2. Exportar un objeto vivo y aplicarlo directamente

- Ubicación: líneas 193–205; sección «kubectl imperativo».
- Gravedad: media.
- Afirmación afectada: `kubectl get ... -o yaml`, editar y ejecutar `kubectl apply -f` es la vía «segura» para modificar un objeto existente.
- Problema: `kubectl apply` presupone que el objeto fue creado inicialmente con `apply` o `create --save-config`. La migración desde gestión imperativa requiere preparar `last-applied-configuration`; aplicar directamente el YAML vivo no constituye por sí solo la vía segura descrita.
- Corrección propuesta: para una modificación puntual, usar `kubectl edit deployment/mi-app` o un comando específico como `kubectl set image`; si se enseña migración declarativa, documentar el procedimiento de migración y retirar los campos de servidor pertinentes.
- Fuentes: [kubectl apply — Kubernetes](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_apply/), [gestión declarativa de objetos — Kubernetes](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/declarative-config/).

### 3. Borrado forzado sin advertencia

- Ubicación: líneas 90–111; variable `now`.
- Gravedad: media.
- Afirmación afectada: `--force --grace-period=0` se presenta únicamente como una forma de eliminar pods sin esperar.
- Problema: el borrado forzado elimina el objeto de la API sin confirmar que el proceso terminó; Kubernetes advierte de posibles procesos duplicados, inconsistencia o pérdida de datos.
- Corrección propuesta: mantener el alias como herramienta de examen, pero añadir que solo debe usarse cuando la tarea lo permita y el riesgo de procesos concurrentes sea aceptable.
- Fuente: [kubectl delete — Kubernetes](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_delete/).

### 4. Ahorro atribuido al alias `k`

- Ubicación: línea 103.
- Gravedad: baja.
- Afirmación afectada: sustituir `kubectl` por `k` ahorra unos ocho caracteres por comando.
- Problema: `kubectl` tiene siete caracteres y `k` uno; la sustitución ahorra seis caracteres. La cifra de más de 200 comandos tampoco está respaldada por la documentación oficial.
- Corrección propuesta: «Reduce de siete a un carácter el nombre del comando y evita escritura repetitiva».
- Fuente: [Important Instructions: CKA and CKAD — Linux Foundation](https://docs.linuxfoundation.org/tc-docs/certification/tips-cka-and-ckad), que confirma que `k` y su autocompletado están preconfigurados.

### 5. Dos espacios descritos como estándar obligatorio

- Ubicación: línea 59.
- Gravedad: baja.
- Afirmación afectada: dos espacios son «el estándar de indentación» de los manifiestos Kubernetes.
- Problema: es una convención frecuente y coherente con los ejemplos oficiales, pero Kubernetes no exige exactamente dos espacios; YAML exige una indentación consistente con espacios.
- Corrección propuesta: sustituir «el estándar» por «una convención habitual y legible».

### 6. Salida esperada abreviada sin indicarlo

- Ubicación: líneas 538–548; criterios del laboratorio cronometrado.
- Gravedad: baja.
- Afirmación afectada: la salida mostrada se presenta como resultado literal de `kubectl get deployment` y `kubectl get svc`.
- Problema: las tablas reales incluyen columnas adicionales, como `AGE` y `EXTERNAL-IP`.
- Corrección propuesta: marcar el bloque como «salida abreviada» o mostrar todas las columnas relevantes.

## Comprobaciones satisfactorias

- El examen actual es práctico, dura dos horas, contiene entre 15 y 20 tareas y exige 66% para aprobar. La versión publicada actualmente es Kubernetes v1.35. Fuentes: [página oficial de CKA](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) y [FAQ oficial](https://docs.linuxfoundation.org/tc-docs/certification/faq-cka-ckad).
- La lista de sitios web permitidos de la sección 9 coincide con la política oficial actual. Fuente: [Resources Allowed — Linux Foundation](https://docs.linuxfoundation.org/tc-docs/certification/certification-resources-allowed).
- El alias `k`, Bash completion, `yq`, `curl` y `wget` están preinstalados en los hosts del examen. Fuente: [Important Instructions: CKA and CKAD](https://docs.linuxfoundation.org/tc-docs/certification/tips-cka-and-ckad).
- Los bloques técnicos están cerrados, usan únicamente los cuatro roles aprobados y no contienen placeholders del tipo `<valor>` dentro de bloques `bash exec`.

## Validación pendiente de entorno

No fue posible comprobar desde este workspace el cluster kubeadm descrito en las líneas 13–19. La instalación local de `kubectl` está confinada por Snap y las únicas máquinas visibles mediante Multipass son dos instancias K3s detenidas sobre Ubuntu 22.04. Esto no demuestra que el entorno descrito sea incorrecto, pero impide validar sus nodos, direcciones y versiones en esta revisión.

## Normalización estructural propuesta

Al aprobar la incorporación:

1. El H1 se trasladará a `title` y el layout generará el único H1 de la página.
2. El cuerpo comenzará en H2 y recibirá anchors explícitos sin numeración visible.
3. Las respuestas del checkpoint y la solución del laboratorio se marcarán semánticamente sin retirarlas del HTML inicial.
4. El fichero incorporado será `src/content/modulos/entorno-laboratorio-kubectl.md`; el original entregado en la raíz permanecerá intacto.
