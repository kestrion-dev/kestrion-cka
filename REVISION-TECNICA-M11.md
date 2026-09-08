# Revisión técnica — M11

Fecha de revisión: 2026-09-08

Módulo revisado: `M11-Ingress-Gateway-API-Exposicion-Servicios.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo.

## Metadatos propuestos

```yaml
code: M11
order: 11
slug: ingress-gateway-api
title: Ingress y Gateway API
description: Expón servicios HTTP/S con Ingress y con su evolución Gateway API (GatewayClass, Gateway, HTTPRoute), incluyendo TLS y migración entre ambos mecanismos.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[helm-kustomize-crds-operators, services-kube-proxy]`. No se propone `examWeight`: el "20%" mencionado es el peso completo del dominio "Services & Networking", compartido con M10 y M12-M13, no el de este módulo individual.

## Discrepancias

### 1. Versión de Gateway API desactualizada

- Ubicación: sección 7.5, "Instalar Gateway API, CRDs y controller".
- Gravedad: baja.
- Comando afectado: `kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml`.
- Problema: la versión `v1.3.0` está desactualizada; a la fecha de esta revisión, la última versión estable de Gateway API es `v1.6.1` (con `v1.5` publicada en febrero de 2026, que promovió varias funciones de Experimental a Standard). El asset de GitHub para `v1.3.0` probablemente sigue siendo descargable, así que el comando no está roto, pero fija una versión con varias releases de retraso.
- Corrección propuesta: fijar la versión estable vigente en el momento de aprobar el módulo (verificar en [github.com/kubernetes-sigs/gateway-api/releases](https://github.com/kubernetes-sigs/gateway-api/releases) cuál es la última, en vez de asumir `v1.3.0`).
- Fuente: [Gateway API v1.5: Moving features to Stable — Kubernetes Blog](https://kubernetes.io/blog/2026/04/21/gateway-api-v1-5/), [Releases — kubernetes-sigs/gateway-api](https://github.com/kubernetes-sigs/gateway-api/releases).

## Comprobaciones satisfactorias

- El comando de instalación de NGINX Gateway Fabric vía Helm OCI, `helm install ngf oci://ghcr.io/nginx/charts/nginx-gateway-fabric`, es exactamente el actual según la documentación oficial de NGINX.
- El nombre del controller, `gateway.nginx.org/nginx-gateway-controller`, usado tanto en la GatewayClass como en la bandera `--gateway-ctlr-name` del deployment real, es correcto.
- La distinción entre Ingress, IngressClass e Ingress Controller, y el uso de la anotación `ingressclass.kubernetes.io/is-default-class` para la clase por defecto, son correctos.
- Los tres valores de `pathType` (`Exact`, `Prefix`, `ImplementationSpecific`) y su semántica son correctos.
- Los tres objetos de Gateway API (GatewayClass, Gateway, HTTPRoute) y la separación de responsabilidades por rol (proveedor de infraestructura, operador de cluster, desarrollador de aplicación) coinciden con el diseño documentado del proyecto.
- Las condiciones de estado `Accepted` y `ResolvedRefs` en `status.parents[]` de un HTTPRoute, y su significado, son correctos.
- El tipo de Secret `kubernetes.io/tls` compartido entre Ingress y Gateway API, y su reutilización del Secret generado por cert-manager (M06), es correcto.
- Traefik como Ingress Controller por defecto de K3s es correcto.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec`.

Fuentes: [Ingress — Kubernetes](https://kubernetes.io/docs/concepts/services-networking/ingress/), [Gateway API — gateway-api.sigs.k8s.io](https://gateway-api.sigs.k8s.io/), [Install NGINX Gateway Fabric with Helm — NGINX Docs](https://docs.nginx.com/nginx-gateway-fabric/install/helm/), [Releases — kubernetes-sigs/gateway-api](https://github.com/kubernetes-sigs/gateway-api/releases).
