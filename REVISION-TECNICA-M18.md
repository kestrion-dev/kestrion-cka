# Revisión técnica — M18

Fecha de revisión: 2026-09-08

Módulo revisado: `M18-Simulacro-CKA-Cronometrado.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M18
order: 18
slug: simulacro-cka-cronometrado
title: Simulacro CKA cronometrado
description: Examen simulado completo de 18 tareas y 120 minutos, con la misma distribución de peso por dominio que el examen real, para medir velocidad de ejecución.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: los 17 módulos anteriores completos (`entorno-laboratorio-kubectl`, `arquitectura-kubernetes`, `kubeadm-etcd-backup-restore-upgrade`, `control-plane-alta-disponibilidad`, `rbac-seguridad-cluster`, `helm-kustomize-crds-operators`, `workloads-deployments-daemonsets-statefulsets`, `jobs-cronjobs-gestion-recursos`, `scheduling-avanzado-affinity-taints-priority`, `services-kube-proxy`, `ingress-gateway-api`, `networkpolicy-segmentacion`, `coredns-resolucion-nombres`, `storage-pv-pvc-storageclass`, `troubleshooting-cluster-control-plane`, `troubleshooting-nodos-networking`, `troubleshooting-aplicaciones-storage`), tal como el propio módulo indica explícitamente ("tras haber practicado los 17 módulos anteriores"). No se propone `examWeight` (el módulo no es una tarea del examen real, es el simulacro completo).

## Discrepancias

Ninguna. Este módulo es una síntesis: reutiliza comandos y patrones ya verificados en M01-M17 sin introducir mecanismos nuevos. Se verificaron los dos elementos propios de este módulo:

- La coherencia interna de la puntuación: cada dominio suma exactamente su peso oficial (Cluster Architecture 6+7+6+6=25, Workloads & Scheduling 5+5+5=15, Services & Networking 5+5+5+5=20, Storage 5+5=10, Troubleshooting 6+6+6+6+6=30), y el total de 100 puntos con aprobado en 66, coinciden con los datos ya confirmados a lo largo de esta ronda de revisión.
- Las columnas exactas de `kubeadm certs check-expiration` (`CERTIFICATE`, `EXPIRES`, `RESIDUAL TIME`, `CERTIFICATE AUTHORITY`, `EXTERNALLY MANAGED`), usadas en la Tarea 4 para identificar el certificado más próximo a expirar, coinciden con el formato real del comando.

## Comprobaciones satisfactorias

- Todos los comandos de las 18 soluciones son coherentes con lo ya verificado en sus módulos de origen respectivos (RBAC en M05, etcd en M03, Helm en M06, Deployments en M07, CronJob en M08, affinity/tolerations en M09, Services/NodePort en M10, Ingress en M11, NetworkPolicy en M12, DNS en M13, PV/PVC/StatefulSet en M14, y los tres escenarios de troubleshooting en M15-M17).
- La Tarea 17 aplica correctamente la lección de M09/M17 sobre inmutabilidad de campos de un pod ya creado: el `kubectl patch` sobre `livenessProbe` probablemente sea rechazado, y la solución incluye el fallback correcto de eliminar y recrear.
- El análisis de resultados por dominio, en vez de tarea por tarea, es una recomendación pedagógica razonable y no una afirmación técnica verificable.

Fuentes: [kubeadm certs check-expiration — referencia](https://v1-34.docs.kubernetes.io/docs/reference/setup-tools/kubeadm/generated/kubeadm_certs/kubeadm_certs_check-expiration), y las fuentes ya citadas en `REVISION-TECNICA-M01.md` a `REVISION-TECNICA-M17.md` para cada patrón reutilizado.
