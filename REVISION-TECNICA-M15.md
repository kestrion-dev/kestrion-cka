# Revisión técnica — M15

Fecha de revisión: 2026-09-08

Módulo revisado: `M15-Troubleshooting-Cluster-CP.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo. No se encontraron discrepancias técnicas.

## Metadatos propuestos

```yaml
code: M15
order: 15
slug: troubleshooting-cluster-control-plane
title: Troubleshooting — Cluster y Control Plane
description: Diagnostica y resuelve fallos del control plane con metodología sistemática — apiserver inalcanzable, certificados expirados, etcd roto, static pods inválidos y kubeconfigs incorrectos.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes, kubeadm-etcd-backup-restore-upgrade, control-plane-alta-disponibilidad, rbac-seguridad-cluster]`. No se propone `examWeight`: el "30%" mencionado es el peso completo del dominio "Troubleshooting", repartido entre este módulo y M16-M17.

## Discrepancias

Ninguna. Se verificaron los dos datos más específicos y con mayor riesgo de error: el valor por defecto de `fileCheckFrequency` de kubelet (20 segundos, el intervalo que el módulo usa para calcular cuánto esperar tras mover manifiestos) y el nombre exacto del comando de K3s para rotar certificados (`k3s certificate rotate`), ambos confirmados correctos.

## Comprobaciones satisfactorias

- La metodología de diagnóstico de arriba hacia abajo (kubectl → apiserver como proceso → kubelet → containerd → etcd) es una aplicación coherente del flujo de arquitectura visto en M02.
- El hecho de que `kubeadm certs renew all` reescribe los ficheros en disco pero no recarga los procesos ya corriendo, y que hay que forzar la recreación de los static pods moviendo sus manifiestos fuera y de vuelta a `/etc/kubernetes/manifests/`, es correcto.
- `kubectl get --raw=/healthz` como comprobación de salud del apiserver es correcta.
- La distinción entre "certificate has expired" (problema de fecha) y "certificate signed by unknown authority" (problema de CA/kubeconfig desactualizado) es correcta.
- El hecho de que un manifiesto de static pod con YAML inválido nunca llega a registrarse en la API, y que el diagnóstico correcto es `journalctl -u kubelet`, no `kubectl describe pod`, es correcto.
- El escenario de leader election fallido entre varios `kube-controller-manager` en un cluster HA (M04) como causa de que el reconciliation loop parezca detenido es correcto.
- La alternativa K3s (`k3s crictl`, `journalctl -u k3s` en lugar de `-u kubelet`, y `k3s certificate rotate` en lugar de `kubeadm certs renew`) es correcta.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec`.

Fuentes: [Certificate Management with kubeadm — Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/), [Kubelet Configuration (v1beta1) — fileCheckFrequency](https://pkg.go.dev/k8s.io/kubelet/config/v1beta1), [K3s Certificate Management](https://docs.k3s.io/cli/certificate), [Troubleshooting Clusters — Kubernetes](https://kubernetes.io/docs/tasks/debug/debug-cluster/).
