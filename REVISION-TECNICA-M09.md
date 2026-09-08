# Revisión técnica — M09

Fecha de revisión: 2026-09-08

Módulo revisado: `M09-Scheduling-Affinity-Taints-Tolerations-PriorityClasses.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M09
order: 9
slug: scheduling-avanzado-affinity-taints-priority
title: Scheduling avanzado — Affinity, Taints y PriorityClasses
description: Controla dónde se programan los pods con nodeSelector, node/pod affinity, taints y tolerations, y protege cargas críticas con PriorityClasses y preemption.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets]`. No se propone `examWeight`: el "15%" mencionado es el peso completo del dominio "Workloads & Scheduling", compartido con M07 y M08, no el de este módulo individual.

## Discrepancias

Ninguna. Se verificaron contra fuentes oficiales los dos puntos con mayor riesgo de error:

- El valor por defecto de `tolerationSeconds` que aplica el admission controller `DefaultTolerationSeconds` para los taints `node.kubernetes.io/not-ready` y `node.kubernetes.io/unreachable` es 300 segundos, tal como indica el módulo.
- `spec.tolerations` de un Pod ya creado es efectivamente inmutable: un `kubectl patch`/`edit` que intente añadirlas es rechazado por el apiserver, tal como reproduce el módulo en la sección 7 del laboratorio guiado y en el Caso 2 de troubleshooting. Hay que eliminar y recrear el pod, o corregir el `template.spec.tolerations` si hay un controller detrás.

## Comprobaciones satisfactorias

- Los operadores de `nodeAffinity` (`In`, `NotIn`, `Exists`, `DoesNotExist`, `Gt`, `Lt`) y la estructura `nodeSelectorTerms` (OR) / `matchExpressions` (AND) son correctos.
- La semántica dura/blanda de `requiredDuringSchedulingIgnoredDuringExecution` frente a `preferredDuringSchedulingIgnoredDuringExecution`, y el hecho de que ambas solo se evalúan al programar (no expulsan si las labels cambian después), son correctos.
- `topologyKey` como mecanismo de "cercanía" basado en labels de nodo, no en distancia física, y su papel en pod affinity/anti-affinity, es correcto.
- Los tres efectos de un taint (`NoSchedule`, `PreferNoSchedule`, `NoExecute`) y su comportamiento exacto, incluida la distinción entre bloquear pods nuevos y expulsar pods ya corriendo, son correctos.
- Los operadores de toleration (`Equal` exige clave+valor+efecto; `Exists` solo exige la clave, y sin `effect` coincide con cualquier efecto) son correctos.
- PriorityClass como objeto cluster-wide, el comportamiento de `globalDefault`, la prioridad implícita 0 sin PriorityClass, y la preemption como último recurso (solo si el pod no cabe en ningún nodo por vía normal) son correctos.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados, y los placeholders no aparecen dentro de bloques `bash exec`.

Fuentes: [Assigning Pods to Nodes — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/), [Taints and Tolerations — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/), [Well-Known Labels, Annotations and Taints — Kubernetes](https://kubernetes.io/docs/reference/labels-annotations-taints/), [Pod Priority and Preemption — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/).
