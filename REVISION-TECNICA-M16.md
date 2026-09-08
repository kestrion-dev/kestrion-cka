# Revisión técnica — M16

Fecha de revisión: 2026-09-08

Módulo revisado: `M16-Troubleshooting-Nodos-Networking.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M16
order: 16
slug: troubleshooting-nodos-networking
title: Troubleshooting — Nodos y Networking
description: Diagnostica nodos NotReady, fallos del CNI, conectividad rota entre pods de distintos nodos, presión de recursos y kube-proxy desincronizado.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, helm-kustomize-crds-operators, jobs-cronjobs-gestion-recursos, scheduling-avanzado-affinity-taints-priority]`. No se propone `examWeight`: el "30%" mencionado es el peso completo del dominio "Troubleshooting", repartido entre M15-M17.

## Discrepancias

Ninguna. Se verificó el comando con más riesgo de estar obsoleto o mal escrito, `crictl rmi --prune`, y es correcto (elimina imágenes no usadas; solo requiere una versión de crictl razonablemente reciente).

## Comprobaciones satisfactorias

- Las cinco Conditions de un nodo (`Ready`, `MemoryPressure`, `DiskPressure`, `PIDPressure`, `NetworkUnavailable`) son correctas.
- La correspondencia entre Conditions y los taints que el node controller aplica automáticamente (`not-ready`/`unreachable` con `NoExecute`; `memory-pressure`/`disk-pressure`/`pid-pressure` con `NoSchedule`) es correcta. El módulo no enumera explícitamente el taint `network-unavailable` (que también existe, con efecto `NoSchedule`), pero no afirma nada incorrecto al respecto; es una omisión menor de alcance, no un error.
- La distinción entre el mecanismo de taints (bloquea/expulsa según Conditions) y el eviction manager del kubelet (expulsa pods existentes bajo presión real de recursos, siguiendo el orden de QoS class de M08) es correcta.
- El diagnóstico de `NetworkPluginNotReady`/"cni config uninitialized" como síntoma de un CNI no inicializado en un nodo específico, y el uso de `ip route` para confirmar rutas entre rangos de pods de distintos nodos, son correctos y consistentes con el funcionamiento real de Calico.
- El hecho de que las reglas de kube-proxy son locales a cada nodo, por lo que un fallo puede aislarse a un único nodo mientras el resto del cluster funciona con normalidad, es correcto y consistente con M10.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados, y los placeholders (`<nodo>`, `<pod-atascado>`, etc.) están correctamente en bloques `text reference`, no en `bash exec`.

Fuentes: [Node Conditions — Kubernetes](https://kubernetes.io/docs/concepts/architecture/nodes/#condition), [Taints and Tolerations — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/), [Node-pressure Eviction — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/), [crictl rmi cleanup reference](https://gist.github.com/alexeldeib/2a02ccb3db02ddb828a9c1ef04f2b955).
