# Revisión técnica — M08

Fecha de revisión: 2026-09-08

Módulo revisado: `M08-Jobs-CronJobs-Gestion-Recursos.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M08
order: 8
slug: jobs-cronjobs-gestion-recursos
title: Jobs, CronJobs y gestión de recursos
description: Configura Jobs y CronJobs con completions, parallelism y control de historial, y aplica requests, limits y QoS classes para priorizar pods bajo presión de recursos.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets]`. No se propone `examWeight`: el "15%" mencionado es el peso completo del dominio "Workloads & Scheduling", compartido con M07, no el de este módulo individual.

## Discrepancias

Ninguna. Se verificaron contra la documentación oficial los valores numéricos y comportamientos con mayor riesgo de estar desactualizados o mal recordados:

- `backoffLimit` por defecto es 6, y el backoff exponencial (10s, 20s, 40s..., con tope de 6 minutos) coincide palabra por palabra con la documentación oficial de Jobs.
- `completions` y `parallelism` valen 1 por defecto.
- `successfulJobsHistoryLimit` (3) y `failedJobsHistoryLimit` (1) por defecto, y `concurrencyPolicy: Allow` por defecto, coinciden exactamente con la documentación oficial de CronJob.
- `restartPolicy` en el template de un Job solo admite `Never` u `OnFailure`, nunca `Always`/`Default`.

## Comprobaciones satisfactorias

- La distinción entre `completions` (total de éxitos necesarios) y `parallelism` (concurrencia máxima) y el ejemplo numérico del checkpoint son correctos.
- `activeDeadlineSeconds` como límite de tiempo total independiente de `backoffLimit` (límite de reintentos) es correcto.
- La sintaxis cron de 5 campos y los ejemplos (`*/5 * * * *`, `0 2 * * *`, etc.) son correctos.
- La distinción entre `requests` (usado por el scheduler para decidir el nodo) y `limits` (aplicado por el kubelet/runtime vía cgroups tras el scheduling) es correcta.
- El comportamiento de los límites de CPU (throttling vía CFS quota/period, el proceso se ralentiza, no se mata) frente a los de memoria (el kernel invoca el OOM Killer, `Exit Code: 137` = 128+9/SIGKILL) es correcto.
- Las unidades Mi (mebibytes, 2^20) frente a M (megabytes, 10^6) son correctas.
- Las tres QoS classes (Guaranteed, Burstable, BestEffort), sus condiciones exactas y el orden de evicción bajo presión de memoria del nodo (BestEffort → Burstable → Guaranteed solo si excede su propio request) coinciden con la documentación oficial de gestión de recursos.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec` (los que aparecen, como `<nombre>`, están en prosa o en `text reference`, no en `bash exec`).

Fuentes: [Jobs — Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/job/), [CronJob — Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/), [Resource Management for Pods and Containers — Kubernetes](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/), [Pod Quality of Service Classes — Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/), [Node-pressure Eviction — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/).
