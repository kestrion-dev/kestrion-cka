# Revisión técnica — M02

Fecha de revisión: 2026-09-08

Módulo revisado: `M02-Arquitectura-Kubernetes.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo.

## Metadatos propuestos

```yaml
code: M02
order: 2
slug: arquitectura-kubernetes
title: Arquitectura de Kubernetes
description: Comprende los componentes de Kubernetes, su comunicación, el reconciliation loop y el arranque del control plane con static pods.
access: free
updated: "2026-09-08"
```

## Discrepancias

### 1. Modos actuales de kube-proxy

- Ubicación: sección 4.3, apartado `kube-proxy`.
- Gravedad: media.
- Afirmación afectada: kube-proxy mantiene reglas «típicamente iptables o IPVS».
- Problema: Kubernetes 1.35 ofrece `iptables`, `ipvs` y `nftables`; `nftables` es estable desde 1.33 e IPVS está deprecado desde 1.35. Además, kube-proxy es opcional si se instala una alternativa.
- Corrección propuesta: mencionar los tres modos, marcar IPVS como deprecado y describir kube-proxy como componente opcional.
- Fuente: [Virtual IPs and Service Proxies — Kubernetes 1.35](https://v1-35.docs.kubernetes.io/docs/reference/networking/virtual-ips/).

### 2. Resultados no deterministas del laboratorio

- Ubicación: sección 9, bloque de criterios de éxito.
- Gravedad: alta.
- Afirmación afectada: se esperan exactamente `10` pods en `kube-system` y scheduling en `cka-worker2`.
- Problema: la cantidad depende de los add-ons y réplicas instalados; el nodo elegido depende del estado del scheduler y del cluster al ejecutar la tarea.
- Corrección propuesta: pedir un entero positivo acorde al conteo observado y aceptar un mensaje `Successfully assigned ...` dirigido a cualquier nodo elegible.
- Fuente: [Cluster Architecture — Kubernetes](https://kubernetes.io/docs/concepts/architecture/), que describe que el scheduler selecciona un nodo adecuado según el estado y las restricciones actuales.

### 3. kubelet no es el único componente fuera de un pod

- Ubicación: final de la sección 6.
- Gravedad: media.
- Afirmación afectada: kubelet es «el único componente de la arquitectura que NO es en sí mismo un pod».
- Problema: el container runtime también se instala y ejecuta en cada nodo fuera de los pods; la forma de ejecutar otros componentes depende de la distribución.
- Corrección propuesta: limitar la afirmación a que kubelet se ejecuta como daemon del nodo y, en kubeadm, supervisa los static pods del control plane.
- Fuentes: [configuración de kubelet con kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/) y [Container Runtimes — Kubernetes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/).

### 4. Uso de watch descrito de forma absoluta

- Ubicación: sección 4.6.
- Gravedad: media.
- Afirmación afectada: los componentes y kubelets no realizan polling, sino que usan watch.
- Problema: list/watch es central para observar recursos de la API, pero kubelet también ejecuta sincronización periódica y PLEG sondea el runtime. La formulación absoluta oculta esa parte del comportamiento.
- Corrección propuesta: explicar que list/watch evita sondear continuamente la API, sin negar los ciclos de resincronización ni el polling local del runtime.
- Fuente: [Kubelet Sync Loop — Kubernetes](https://kubernetes.io/docs/reference/node/kubelet-sync-loop/).

### 5. Identificación de mirror pods

- Ubicación: sección 10, caso 3.
- Gravedad: baja.
- Afirmación afectada: `ownerReferences` se usa como prueba principal de que un pod es mirror de un static pod.
- Problema: Kubernetes documenta `kubernetes.io/config.mirror` como el indicador específico y directo.
- Corrección propuesta: comprobar esa anotación mediante jsonpath y dejar `ownerReferences` solo como observación adicional.
- Fuente: [Static Pods — Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/static-pods/).

### 6. K3s descrito como un único proceso

- Ubicación: sección 11.
- Gravedad: baja.
- Afirmación afectada: K3s empaqueta los componentes «dentro de un único binario y proceso».
- Problema: la documentación oficial confirma el binario único, pero describe `k3s server` y `k3s agent` como procesos que lanzan y administran componentes; «un único proceso» es una generalización innecesaria.
- Corrección propuesta: indicar que K3s distribuye y administra esos componentes desde un binario compacto, sin asegurar que todos sean observables como un único proceso.
- Fuente: [CLI Tools — K3s](https://docs.k3s.io/cli).

## Comprobaciones satisfactorias

- La descripción de los componentes principales coincide con la arquitectura oficial de Kubernetes.
- kubeadm genera static pods del control plane en `/etc/kubernetes/manifests` y kubelet supervisa ese directorio.
- Los mirror pods no pueden controlarse desde la API y kubelet los vuelve a crear.
- SQLite es el datastore predeterminado de K3s cuando no se configura otro y no existe un datastore etcd previo.

Fuentes: [Cluster Architecture](https://kubernetes.io/docs/concepts/architecture/), [kubeadm implementation details](https://kubernetes.io/docs/reference/setup-tools/kubeadm/implementation-details/), [Static Pods](https://kubernetes.io/docs/concepts/workloads/pods/static-pods/) y [K3s Cluster Datastore](https://docs.k3s.io/datastore).

## Dependencias editoriales pendientes

Las referencias internas a M03, M05, M06 y M09 deberán resolverse cuando exista el catálogo correspondiente. No se propondrán slugs ni destinos antes de recibir esos módulos.
