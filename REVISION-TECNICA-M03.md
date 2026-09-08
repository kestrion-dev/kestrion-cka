# Revisión técnica — M03

Fecha de revisión: 2026-09-08

Módulo revisado: `M03-kubeadm-Backup-Restore-etcd-Upgrade-Cluster.md`

Estado: sin discrepancias que corregir. La URL de Calico se mantiene tal cual, aprobado por el propietario el 2026-09-08 tras verificar que funciona (ver nota abajo). Este informe no modifica el módulo.

## Metadatos propuestos

```yaml
code: M03
order: 3
slug: kubeadm-etcd-backup-restore-upgrade
title: kubeadm, backup y restore de etcd, y upgrade de cluster
description: Instala un cluster kubeadm de tres nodos, haz backup y restore de etcd, e inspecciona certificados antes de ejecutar el upgrade completo del control plane y los workers.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes]`. No se propone `examWeight`: el módulo no menciona un porcentaje propio (a diferencia de M04-M07, que sí citan el "25%" del dominio y por eso se advirtió lo mismo en sus informes).

## Discrepancias

Ninguna que requiera corrección inmediata. Ver "Nota para investigar más adelante" abajo.

### Nota para investigar más adelante: destino real de la URL de Calico

- Ubicación: sección 7.2, "Instalar Calico".
- Comando: `kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml`.
- Verificado con `curl -IL`: el comando **sí funciona**. `docs.projectcalico.org` responde con un 301 permanente hacia `https://calico-v3-25.netlify.app/archive/v3.25/manifests/calico.yaml`, que devuelve el manifiesto real (200 OK, ~238 KB). La corrección propuesta inicialmente en esta revisión (sustituir por el operador de Tigera en 3 manifiestos) era innecesaria; el propietario decidió (2026-09-08) mantener el comando tal cual está en el módulo.
- Punto pendiente de investigar, no bloqueante: el redirect apunta a un archivo etiquetado "v3.25" (Calico 3.25), una versión con varias releases de antigüedad frente a la más reciente del proyecto. No se ha comprobado si ese manifiesto de la v3.25 sigue siendo compatible con Kubernetes v1.35, el que usa este curso, ni si el quickstart oficial actual (que ahora recomienda el operador de Tigera en vez de un `calico.yaml` único) refleja un cambio de mejor práctica que valga la pena adoptar más adelante, aunque el método antiguo siga funcionando hoy.
- Fuentes: verificación directa (`curl -IL https://docs.projectcalico.org/manifests/calico.yaml`, 2026-09-08), [Calico quickstart guide — Tigera Docs](https://docs.tigera.io/calico/latest/getting-started/kubernetes/quickstart) (método actual recomendado, para referencia futura).

## Comprobaciones satisfactorias

- La salida de ejemplo `etcdctl version: 3.4.30` para `apt install etcd-client` en Ubuntu 24.04 LTS es exactamente la versión real empaquetada (`etcd 3.4.30-1ubuntu0.24.04.3` en el repositorio "noble").
- La validez de 1 año para los certificados no-CA de kubeadm, y los comandos `kubeadm certs check-expiration` / `kubeadm certs renew all`, son correctos.
- El orden de upgrade (control plane completo primero, luego cada worker de uno en uno, nunca en paralelo ni saltando versiones menores) y la distinción entre `kubeadm upgrade apply` (control plane) y `kubeadm upgrade node` (workers) coinciden con la documentación oficial.
- El procedimiento de backup/restore de etcd (detener etcd moviendo su manifiesto fuera de `/etc/kubernetes/manifests/`, restaurar en un directorio nuevo, reemplazar `/var/lib/etcd`, devolver el manifiesto) es correcto y sigue el patrón oficial documentado por Kubernetes.
- La anotación `kubernetes.io/config.mirror` como prueba de mirror pod es consistente con la corrección ya aprobada en M02.
- La alternativa K3s (`k3s etcd-snapshot save`, solo aplicable con el backend etcd habilitado explícitamente; SQLite por defecto; upgrade gestionado por el propio instalador de K3s, no por `kubeadm upgrade`) es correcta.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec`.

Fuentes: [Calico quickstart guide — Tigera Docs](https://docs.tigera.io/calico/latest/getting-started/kubernetes/quickstart), [Backing up an etcd cluster — Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/), [kubeadm upgrade — Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/), [Certificate Management with kubeadm — Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/), [etcd-client package — Ubuntu Noble](https://launchpad.net/ubuntu/+source/etcd/3.4.30-1ubuntu0.24.04.3), [K3s etcd snapshot](https://docs.k3s.io/cli/etcd-snapshot).
