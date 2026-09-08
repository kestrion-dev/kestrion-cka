# Revisión técnica — M07

Fecha de revisión: 2026-09-08

Módulo revisado: `M07- Workloads-Deployments-DaemonSets-StatefulSets.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo.

## Metadatos propuestos

```yaml
code: M07
order: 7
slug: workloads-deployments-daemonsets-statefulsets
title: Workloads — Deployments, DaemonSets y StatefulSets
description: Domina Deployments con RollingUpdate y rollback, DaemonSets por nodo, y StatefulSets con identidad de red y storage estables.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, rbac-seguridad-cluster]`. El módulo también depende de "M03 (kubeadm)", pero ese fichero está vacío en la raíz y aún no tiene slug; no se referencia hasta que exista. No se propone `examWeight`: el "15%" mencionado es el peso completo del dominio "Workloads & Scheduling", no el de este módulo individual.

## Discrepancias

### 1. `kubectl rollout history --no-headers` no es una opción válida

- Ubicación: sección "Laboratorio cronometrado", solución de referencia.
- Gravedad: alta.
- Afirmación/comando afectado: `kubectl rollout history deployment/api-gateway --no-headers 2>/dev/null | wc -l > /tmp/revisiones.txt`.
- Problema: `kubectl rollout history` no admite el flag `--no-headers` (no aparece en su referencia de flags oficial: `--allow-missing-template-keys`, `-f`, `-k`, `-o`, `-R`, `--revision`, `-l`). Al ejecutarse, kubectl devuelve `Error: unknown flag: --no-headers` por stderr; como el comando redirige stderr a `/dev/null`, `wc -l` cuenta 0 líneas de una entrada vacía, y `/tmp/revisiones.txt` quedaría con `0`, no `2` como muestra el bloque de "Criterios de éxito". El comando, tal como está escrito, no supera su propio criterio de éxito.
- Corrección propuesta: sustituir por un conteo robusto a los encabezados, por ejemplo `kubectl rollout history deployment/api-gateway | grep -cE '^[0-9]+' > /tmp/revisiones.txt`, que cuenta solo las líneas de revisión.
- Fuente: [kubectl rollout history — Kubernetes Reference](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_history/).

### 2. `--disable-agent` descrito como el mecanismo para replicar el taint de control-plane en K3s

- Ubicación: sección 12, "Alternativa K3s (plan B)".
- Gravedad: media.
- Afirmación afectada: "K3s por defecto no aplica el taint de control-plane a su único nodo, a menos que se instale explícitamente con `--disable-agent` en una topología separada."
- Problema: `--disable-agent` no aplica ningún taint. Un server iniciado con `--disable-agent` no ejecuta kubelet, container runtime ni CNI, y por eso ni siquiera se registra como Node del cluster (no aparece en `kubectl get nodes`); es un nodo de control plane "sin agente", no un nodo tainted que aparece pero rechaza pods. El mecanismo real para reproducir el comportamiento de kubeadm (nodo visible pero sin poder programar cargas normales) es `--node-taint`, por ejemplo `--node-taint k3s-controlplane=true:NoExecute`, aplicado al registrar el nodo.
- Corrección propuesta: sustituir la mención de `--disable-agent` por `--node-taint k3s-controlplane=true:NoExecute` para el caso de "control plane visible pero no programable", y opcionalmente mencionar `--disable-agent` por separado como una topología distinta (control plane sin kubelet en absoluto, útil para ocultar nodos de control plane de los agentes).
- Fuente: [Managing Server Roles — K3s](https://docs.k3s.io/installation/server-roles), [Advanced Options / Configuration — K3s](https://docs.k3s.io/advanced).

## Comprobaciones satisfactorias

- El peso del dominio "Workloads & Scheduling" (15%) es correcto.
- El algoritmo completo de selección de pods a eliminar al escalar hacia abajo un ReplicaSet, en las ocho reglas exactas y en el orden exacto que describe el módulo (no asignados/fase desconocida → no Ready antes que Ready → `pod-deletion-cost` más bajo → coubicación con más réplicas del mismo RS → menor tiempo en Ready → más reinicios → creado más recientemente → UUID pseudoaleatorio), coincide exactamente con el algoritmo real de Kubernetes.
- El cambio de Kubernetes 1.12 en el scheduling de DaemonSet (el controller ya no asigna `spec.nodeName` directamente; crea el pod con `nodeAffinity` y el scheduler por defecto hace el bind) es correcto, incluida la consecuencia de que los pods de DaemonSet sí compiten por recursos y pueden quedar Pending.
- Los valores por defecto de Deployment (`maxSurge`/`maxUnavailable` 25%, `revisionHistoryLimit` 10, `progressDeadlineSeconds` 600) son correctos.
- El comportamiento de `kubectl rollout undo` como un nuevo rollout (no un cambio instantáneo) es correcto.
- Las tres garantías de StatefulSet (nombre ordinal estable, orden de creación/eliminación con `OrderedReady` como política por defecto, PVC individual por pod) y la necesidad de un Headless Service (`clusterIP: None`) para DNS individual por pod son correctas.
- El taint por defecto del control plane de kubeadm (`node-role.kubernetes.io/control-plane:NoSchedule`) es correcto.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados, y los placeholders (`<label>`, `<nombre>`, `<pod-nuevo>`, `<selector-del-daemonset>`) están correctamente en bloques `text reference`, no dentro de `bash exec`.

Fuentes: [ReplicaSet — Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/), [How Kubernetes picks which pods to delete during scale-in](https://rpadovani.com/k8s-algorithm-pick-pod-scale-in), [DaemonSet — Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/), [Deployments — Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/), [StatefulSets — Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/), [kubectl rollout history — referencia](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_history/), [Managing Server Roles — K3s](https://docs.k3s.io/installation/server-roles).
