# Revisión técnica — M06

Fecha de revisión: 2026-09-08

Módulo revisado: `M06-Helm-Kust-CRDs-Operators-Exts-Int.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M06
order: 6
slug: helm-kustomize-crds-operators
title: Helm, Kustomize, CRDs y Operators
description: Instala componentes con Helm y Kustomize, crea Custom Resource Definitions, entiende el patrón Operator y las interfaces de extensión CNI, CSI y CRI.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, rbac-seguridad-cluster]`. El módulo también depende de "M03 (kubeadm)", pero ese fichero está vacío en la raíz y aún no tiene slug; no se referencia hasta que exista. No se propone `examWeight`: el "25%" mencionado es el peso del dominio completo, compartido con M02, M03, M04 y M05, no el de este módulo individual.

## Discrepancias

Ninguna. Se verificaron contra fuentes oficiales y del proyecto los puntos con mayor riesgo de quedar desactualizados o de estar mal atribuidos:

- El parámetro Helm `crds.enabled=true` para instalar los CRDs de cert-manager es el actual (sustituye a `installCRDs`, deprecado desde cert-manager 1.15).
- La competencia "Use Helm and Kustomize to install cluster components" pertenece al dominio "Cluster Architecture, Installation & Configuration" (25%), tal como indica el módulo.
- `kubectl apply -k` / `kubectl kustomize` están integrados de forma nativa en kubectl desde la versión 1.14, sin necesitar el binario `kustomize` por separado.
- El CRD `HelmChart` de K3s pertenece al apiGroup `helm.cattle.io`, tal como indica el módulo.
- El ejemplo de CRD (`crontabs.stable.example.com`, `apiextensions.k8s.io/v1`) reproduce fielmente el tutorial oficial de Kubernetes sobre Custom Resources.

## Comprobaciones satisfactorias

- Los tres conceptos de Helm (Chart, Release, Values) y el hecho de que Helm 3 guarda el estado del release como Secret (`sh.helm.release.v1.<nombre>.v<revisión>`) en el namespace del release, sin componente Tiller, son correctos.
- La distinción de filosofía Helm (templates con variables) frente a Kustomize (YAML plano más overlays/patches) es correcta y coincide con la documentación de ambos proyectos.
- El comportamiento de un CRD sin controller (el objeto se guarda en etcd pero ningún componente actúa sobre él) y la definición de Operator como CRD + Controller con reconciliation loop son correctas y coinciden con la documentación de Kubernetes y con el patrón Operator descrito por la comunidad.
- Los ejemplos de cert-manager (`ClusterIssuer` con `selfSigned: {}`, objeto `Certificate` con `secretName`, `issuerRef`, `commonName`, `dnsNames`) usan la sintaxis actual de la API `cert-manager.io/v1`.
- Las tres interfaces de extensión (CNI, CSI, CRI), sus responsabilidades y ejemplos de implementaciones son correctos; la afirmación de que Docker no implementa CRI de forma nativa desde hace varias versiones es consistente con la eliminación de dockershim en Kubernetes 1.24.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados, y los comandos con placeholders (`<token-real-del-init>` no aparece aquí; los patches y kustomizations usan nombres reales) no contienen placeholders dentro de `bash exec`.

Fuentes: [Helm - cert-manager Documentation](https://cert-manager.io/docs/installation/helm/), [CKA Mod 1: Use Helm and Kustomize — RX-M](https://rx-m.com/lesson/cka-mod-1-use-helm-and-kustomize-to-install-cluster-components/), [Declarative Management of Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/), [Extend the Kubernetes API with CustomResourceDefinitions](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/), [K3s Helm Chart Management — k3s-io/helm-controller](https://github.com/k3s-io/helm-controller), [Container Runtime Interface (CRI) — Kubernetes](https://kubernetes.io/docs/concepts/architecture/cri/).
