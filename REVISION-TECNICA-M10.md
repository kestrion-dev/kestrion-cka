# Revisión técnica — M10

Fecha de revisión: 2026-09-08

Módulo revisado: `M10-Services-kube-proxy.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M10
order: 10
slug: services-kube-proxy
title: Services y kube-proxy
description: Domina los cuatro tipos de Service, Endpoints y EndpointSlices, y los tres modos de kube-proxy que traducen un Service en reglas reales de red.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets]`. No se propone `examWeight`: el "20%" mencionado es el peso completo del dominio "Services & Networking", que cubrirán también los módulos siguientes de networking, no el de este módulo individual.

## Discrepancias

Ninguna. Se verificó específicamente el dato con mayor riesgo de estar mal recordado (versión exacta en la que kube-proxy empezó a usar EndpointSlices por defecto) y coincide exactamente: el *feature gate* `EndpointSliceProxying` graduó a beta en Linux en Kubernetes 1.19, momento desde el cual kube-proxy usa EndpointSlices por defecto en lugar de Endpoints, tal como indica el módulo.

## Comprobaciones satisfactorias

- El peso del dominio "Services & Networking" (20%) es correcto.
- Los cuatro tipos de Service (ClusterIP, NodePort, LoadBalancer, ExternalName) y sus diferencias son correctos, incluido el comportamiento esperado de `EXTERNAL-IP: <pending>` en un cluster bare-metal sin cloud controller.
- El rango por defecto de NodePort (30000-32767) es correcto.
- El mecanismo de vínculo entre un Service sin selector y un objeto `Endpoints` manual (coincidencia exacta de `metadata.name`, sin otro campo de referencia) es correcto.
- Los tres modos de kube-proxy (iptables como default de kubeadm, IPVS deprecado desde 1.35, nftables GA desde 1.33) son consistentes con lo ya verificado en la revisión de M02.
- El hecho de que kube-proxy es opcional (algunos CNI, como Cilium en modo de reemplazo, prescinden de él) es correcto y consistente con M02.
- El comportamiento de ServiceLB (Klipper) de K3s como excepción al `<pending>` de LoadBalancer es correcto.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec`.

Fuentes: [Service — Kubernetes](https://kubernetes.io/docs/concepts/services-networking/service/), [EndpointSlices — Kubernetes](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/), [Scaling Kubernetes Networking With EndpointSlices — Kubernetes Blog](https://www.kubernetes.io/blog/2020/09/02/scaling-kubernetes-networking-with-endpointslices/), [kube-proxy — Kubernetes Reference](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-proxy/).
