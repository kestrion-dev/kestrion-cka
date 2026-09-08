# Revisión técnica — M14

Fecha de revisión: 2026-09-08

Módulo revisado: `M14-Storage-pv-pvc-StorageClass.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo.

## Metadatos propuestos

```yaml
code: M14
order: 14
slug: storage-pv-pvc-storageclass
title: Storage — PersistentVolume, PersistentVolumeClaim y StorageClass
description: Desacopla el almacenamiento del ciclo de vida del pod con PV, PVC y StorageClass, aprovisionamiento estático y dinámico, access modes y reclaim policies.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[helm-kustomize-crds-operators, workloads-deployments-daemonsets-statefulsets]`. No se propone `examWeight`: el "10%" mencionado es el peso completo del dominio "Storage".

## Discrepancias

### 1. Instalación de local-path-provisioner sin versión fijada

- Ubicación: sección 7.3, "StorageClass con aprovisionamiento dinámico real".
- Gravedad: baja-media.
- Comando afectado: `kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml`.
- Problema: el propio README del proyecto recomienda fijar una versión estable (por ejemplo `v0.0.37`) y presenta explícitamente la rama `master` como la "versión de desarrollo", no la recomendada para uso normal. Apuntar a `master` no está roto, pero el contenido puede cambiar sin aviso entre el momento de aprobar el módulo y el momento en que un estudiante lo ejecute, con riesgo de comportamiento inconsistente o de encontrar código todavía no probado.
- Corrección propuesta: fijar una versión de release concreta, comprobando en el momento de aprobar cuál es la última etiqueta estable en [github.com/rancher/local-path-provisioner/releases](https://github.com/rancher/local-path-provisioner/releases), por ejemplo `.../v0.0.37/deploy/local-path-storage.yaml` u otra más reciente si existe.
- Fuente: [rancher/local-path-provisioner — README](https://github.com/rancher/local-path-provisioner).

## Comprobaciones satisfactorias

- El peso del dominio "Storage" (10%) es correcto, y consistente con el desglose completo confirmado a lo largo de esta ronda de revisión (Cluster Architecture 25%, Workloads & Scheduling 15%, Services & Networking 20%, Storage 10%, Troubleshooting 30%, que suman 100%).
- La restricción de `ReadWriteOnce` a nivel de NODO, no de pod individual (varios pods del mismo nodo pueden compartir el volumen), y `ReadWriteOncePod` como la variante que sí restringe a un único pod, son correctas.
- Las políticas `Retain` y `Delete`, su comportamiento exacto, y `Recycle` como deprecada, son correctas.
- El comportamiento distinto de `storageClassName` omitido (usa la StorageClass default) frente a `""` explícito (deshabilita el aprovisionamiento dinámico, bindea solo contra PVs sin clase) es correcto y coincide con la documentación oficial.
- `volumeBindingMode: Immediate` (por defecto) frente a `WaitForFirstConsumer`, y su relevancia para storage sensible a topología, es correcto.
- El patrón de nombres de PVC generadas por `volumeClaimTemplates` en un StatefulSet (`<template>-<statefulset>-<índice>`) es correcto.
- `nodeAffinity` como requisito práctico de un PV `hostPath` para evitar que un pod se programe en un nodo sin el directorio real es correcto.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec`.

Fuentes: [Persistent Volumes — Kubernetes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/), [Storage Classes — Kubernetes](https://kubernetes.io/docs/concepts/storage/storage-classes/), [rancher/local-path-provisioner](https://github.com/rancher/local-path-provisioner).
