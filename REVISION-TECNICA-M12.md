# Revisión técnica — M12

Fecha de revisión: 2026-09-08

Módulo revisado: `M12-NetworkPolicy-Segmentacion.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M12
order: 12
slug: networkpolicy-segmentacion
title: NetworkPolicy y segmentación
description: Restringe el tráfico ingress y egress entre pods con NetworkPolicy, combinando podSelector, namespaceSelector e ipBlock, implementadas realmente por el CNI.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, helm-kustomize-crds-operators]`. No se propone `examWeight`: el "20%" mencionado es el peso completo del dominio "Services & Networking", no el de este módulo individual.

## Discrepancias

Ninguna. Se verificó específicamente la regla con más riesgo de estar mal explicada (combinación AND/OR de `podSelector` y `namespaceSelector`) contra la documentación oficial, y coincide exactamente: dentro del MISMO elemento de la lista `from`/`to`, `namespaceSelector` y `podSelector` se combinan con AND; como elementos SEPARADOS de la lista, se combinan con OR. También se confirmó textualmente que varias NetworkPolicies sobre el mismo pod se combinan de forma aditiva (unión), nunca como intersección.

## Comprobaciones satisfactorias

- El modelo de red por defecto de Kubernetes (completamente abierto sin ninguna NetworkPolicy) es correcto.
- El hecho de que una NetworkPolicy solo puede restringir, nunca abrir tráfico por sí sola, y que `podSelector: {}` selecciona todos los pods del namespace, es correcto.
- El comportamiento independiente de `policyTypes: [Ingress]` frente a `[Egress]` (un pod puede tener una dirección restringida y la otra completamente abierta) es correcto.
- `ipBlock` con `except` para excluir subrangos es correcto.
- El hecho de que el apiserver solo almacena el objeto NetworkPolicy y es el CNI (Calico en este cluster) quien lo traduce en filtrado real, y que un CNI que no lo implemente (Flannel sin complementos) acepta el objeto sin error pero sin efecto real, es correcto.
- Flannel como CNI por defecto de K3s, sin soporte nativo de NetworkPolicy, es correcto.
- La necesidad de permitir explícitamente el puerto 53 (UDP, y también TCP para respuestas grandes) en una política de egress restrictiva para no romper la resolución DNS es correcta.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec`.

Fuentes: [Network Policies — Kubernetes](https://kubernetes.io/docs/concepts/services-networking/network-policies/), [Declare Network Policy — Kubernetes Tasks](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/).
