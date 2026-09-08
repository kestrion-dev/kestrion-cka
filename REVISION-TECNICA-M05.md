# Revisión técnica — M05

Fecha de revisión: 2026-09-08

Módulo revisado: `M05-RBAC-Seguridad-Cluster.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M05
order: 5
slug: rbac-seguridad-cluster
title: RBAC y seguridad del cluster
description: Aplica el flujo completo de RBAC (Role, ClusterRole, RoleBinding, ClusterRoleBinding y ServiceAccounts) para crear identidades y controlar el acceso a la API.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes]`. El módulo también depende de "M03 (kubeadm)" para la CA del cluster, pero ese fichero está vacío en la raíz y aún no tiene slug; no se referencia hasta que exista. No se propone `examWeight`: el "25%" que menciona el módulo es el peso del dominio oficial completo (compartido con M02, M03 y M04), no el de este módulo individual — mismo caso que en M04.

## Discrepancias

Ninguna. Se verificaron contra fuentes oficiales los puntos con mayor riesgo de error (flujo de autenticación/autorización/admisión y sus códigos HTTP, formato de identidad de usuarios y ServiceAccounts, los cuatro objetos RBAC y su matriz de uso, los `apiGroups` de ejemplo, el campo `expirationSeconds` del CSR y su mínimo de 600 segundos, la inmutabilidad de `roleRef`, y las rutas de CA de K3s) sin encontrar afirmaciones incorrectas.

## Comprobaciones satisfactorias

- El flujo autenticación (401) → autorización/RBAC (403) → admisión, y la explicación de qué representa cada código HTTP, coincide con el comportamiento documentado del apiserver.
- Kubernetes no tiene un objeto `User`; la identidad de un usuario se basa en el CN (usuario) y O (grupo) del certificado X.509. Correcto.
- Los cuatro objetos RBAC (Role, ClusterRole, RoleBinding, ClusterRoleBinding) y la matriz de decisión (Role+RoleBinding para un namespace; ClusterRole+RoleBinding por namespace para reutilizar permisos; ClusterRole+ClusterRoleBinding para alcance de cluster) coinciden con la documentación oficial de RBAC.
- Los `apiGroups` de ejemplo (`""` core, `apps`, `batch`, `networking.k8s.io`, `rbac.authorization.k8s.io`) y los recursos que contienen son correctos.
- El campo `expirationSeconds` de un `CertificateSigningRequest` existe desde Kubernetes v1.22, con un mínimo de 600 segundos; el valor usado en el módulo, 86400, es válido.
- El campo `roleRef` de un binding es inmutable; corregirlo exige borrar y recrear el binding, tal como indica el módulo. Las `rules` de un Role/ClusterRole sí son editables.
- El formato de identidad `system:serviceaccount:<namespace>:<nombre>` para `--as=` y el flag `--serviceaccount=NAMESPACE:NOMBRE` de `kubectl create rolebinding`/`clusterrolebinding` son correctos.
- Las rutas de CA de K3s (`/var/lib/rancher/k3s/server/tls/client-ca.crt` para firmar identidades de cliente, `server-ca.crt` para el kubeconfig) y el kubeconfig admin en `/etc/rancher/k3s/k3s.yaml` coinciden con la documentación y el código de K3s.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados, y el único heredoc sin comillas (`<<EOF` en vez de `<<'EOF'`, necesario para expandir `$CSR_B64`) está justificado explícitamente en el propio texto.

Fuentes: [Using RBAC Authorization — Kubernetes](https://kubernetes.io/docs/reference/access-authn-authz/rbac/), [Certificate Signing Requests — Kubernetes](https://kubernetes.io/docs/reference/access-authn-authz/certificate-signing-requests/), [Authenticating — Kubernetes](https://kubernetes.io/docs/reference/access-authn-authz/authentication/), [K3s certificate command](https://docs.k3s.io/cli/certificate), [K3s CIS self-assessment (rutas de TLS)](https://docs.k3s.io/security/self-assessment-1.8).
