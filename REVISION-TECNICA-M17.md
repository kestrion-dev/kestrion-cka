# Revisión técnica — M17

Fecha de revisión: 2026-09-08

Módulo revisado: `M17-Troubleshooting-Aplicaciones-Storage.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M17
order: 17
slug: troubleshooting-aplicaciones-storage
title: Troubleshooting — Aplicaciones y Storage
description: Diagnostica ImagePullBackOff, ConfigMaps y Secrets faltantes, init containers bloqueados, probes mal configuradas, y fallos de storage a nivel de pod.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[rbac-seguridad-cluster, workloads-deployments-daemonsets-statefulsets, jobs-cronjobs-gestion-recursos, storage-pv-pvc-storageclass]`. No se propone `examWeight`: el "30%" mencionado es el peso completo del dominio "Troubleshooting", repartido entre M15-M17.

## Discrepancias

Ninguna. Se verificó el mensaje más específico y citable del módulo, el error de Multi-Attach (`Multi-Attach error for volume "..." Volume is already exclusively attached to one node and can't be attached to another`), y coincide exactamente con el mensaje real documentado.

## Comprobaciones satisfactorias

- La distinción entre `ImagePullBackOff`/`ErrImagePull` (fallo al descargar la imagen, por nombre o credenciales) y `CreateContainerConfigError` (un ConfigMap o Secret referenciado no existe) es correcta; ambos son estados reales y distintos de Kubernetes.
- El comportamiento de readiness probe (retira el pod de los Endpoints sin reiniciarlo) frente a liveness probe (kubelet reinicia el contenedor) es correcto y consistente con la documentación oficial de probes.
- El orden estricto de ejecución de los init containers, y que ningún container principal arranca hasta que todos terminen con éxito, es correcto.
- `kubectl logs <pod> -c <container>` como forma obligatoria de especificar el contenedor en pods multi-contenedor es correcta.
- El uso de `fsGroup` en el `securityContext` a nivel de pod para resolver permisos de escritura de un proceso no-root sobre un volumen montado es correcto.
- El error de Multi-Attach como consecuencia directa del límite de `ReadWriteOnce` a nivel de nodo (M14), y su causa típica (un pod "fantasma" en el nodo viejo que no liberó el volumen), son correctos.
- `kubectl delete pod ... --grace-period=0 --force` como mecanismo, y la advertencia sobre su riesgo si el nodo de origen no está confirmado como inalcanzable, son correctos.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados, y los placeholders están correctamente en bloques `text reference`, no en `bash exec`.

Fuentes: [Debug Pods — Kubernetes](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/), [Configure Liveness, Readiness and Startup Probes — Kubernetes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/), [Init Containers — Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/), [Configure a Security Context for a Pod or Container — Kubernetes](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/), [Multi-Attach error discussion — Kubernetes Forum](https://discuss.kubernetes.io/t/multi-attach-error-for-volume-pvc-volume-is-already-exclusively-attached-to-one-node-and-cant-be-attached-to-another/18951).
