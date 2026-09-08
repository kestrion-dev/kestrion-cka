# Revisión técnica — M13

Fecha de revisión: 2026-09-08

Módulo revisado: `M13-CoreDNS-Resolucion-Nombres.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M13
order: 13
slug: coredns-resolucion-nombres
title: CoreDNS y resolución de nombres
description: Entiende cómo CoreDNS resuelve nombres de Services y pods, las convenciones DNS del cluster, el Corefile, y cómo diagnosticar fallos de resolución.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets, services-kube-proxy]`. No se propone `examWeight`: el "20%" mencionado es el peso completo del dominio "Services & Networking", no el de este módulo individual.

## Discrepancias

Ninguna. Se verificó el dato con más riesgo de estar mal recordado (versión exacta del reemplazo de kube-dns por CoreDNS) y coincide exactamente: CoreDNS pasó a ser el DNS por defecto de kubeadm en Kubernetes 1.13 (GA), tal como indica el módulo.

## Comprobaciones satisfactorias

- CoreDNS corriendo como Deployment (no DaemonSet) y la explicación de por qué (resolución centralizada e intercambiable, a diferencia de kube-proxy que necesita reglas locales por nodo) es correcta.
- El Service `kube-dns` con ClusterIP fija (típicamente `10.96.0.10` en el rango por defecto) y el nombre histórico mantenido por compatibilidad son correctos.
- El patrón de nombres DNS de Service (`<service>.<namespace>.svc.cluster.local`) y de pod individual en un Headless Service (`<pod>.<service>.<namespace>.svc.cluster.local`) son correctos.
- Los plugins del Corefile por defecto de kubeadm (`errors`, `health`, `ready`, `kubernetes`, `prometheus`, `forward`, `cache`, `loop`, `reload`, `loadbalance`) y su función coinciden con la configuración real que genera kubeadm.
- Los cuatro valores de `dnsPolicy` (`ClusterFirst`, `Default`, `ClusterFirstWithHostNet`, `None`) y su semántica, incluida la advertencia sobre el nombre confuso de `Default`, son correctos.
- El valor por defecto `ndots:5` y su efecto en la latencia de resolución de dominios externos es correcto.
- El mensaje `[FATAL] plugin/loop: Loop (...) detected` como síntoma de un bucle de reenvío en CoreDNS es un mensaje real y documentado del plugin `loop`.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec`.

Fuentes: [Kubernetes 1.13 Release Announcement — CoreDNS GA](https://kubernetes.io/blog/2018/12/03/kubernetes-1-13-release-announcement/), [Customizing DNS Service — Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/), [DNS for Services and Pods — Kubernetes](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/), [CoreDNS loop plugin troubleshooting](https://coredns.io/plugins/loop/#troubleshooting).
