# Revisión técnica — M04

Fecha de revisión: 2026-09-08

Módulo revisado: `M04-Control-Plane-Alta-Disponibilidad-HA.md`

Estado: pendiente de aprobación del propietario. Este informe no modifica el módulo.

## Metadatos propuestos

```yaml
code: M04
order: 4
slug: control-plane-alta-disponibilidad
title: Control plane de alta disponibilidad (HA)
description: Calcula el quorum de etcd, distingue las topologías stacked y external, y aplica los comandos de kubeadm para un control plane de alta disponibilidad.
access: free
updated: "2026-09-08"
```

`prerequisites` sugerido: `[arquitectura-kubernetes]`. El módulo también depende de "M03 (kubeadm)", pero ese fichero está vacío en la raíz (`M03-kubeadm-Backup-Restore-etcd-Upgrade-Cluster.md`, 0 bytes) y aún no tiene slug en el catálogo; no se referencia hasta que exista. No se propone `examWeight`: el "25%" que menciona el módulo es el peso del dominio oficial "Cluster Architecture, Installation & Configuration" completo, compartido con varios módulos (M02, M03, este M04), no el peso individual de este módulo — asignarlo como `examWeight` induciría a error.

## Discrepancias

### 1. Recuento de máquinas por topología omite los workers

- Ubicación: sección 4.3, "Etcd apilado" y "Etcd externo".
- Gravedad: media.
- Afirmación afectada: "requiere menos máquinas, 3 en vez de 6" (stacked) y "requiere el doble de máquinas como mínimo, 3 para el control plane y 3 para etcd, 6 en total" (external).
- Problema: la guía oficial de kubeadm para HA cuenta el clúster completo, incluidos como mínimo 3 workers en ambas topologías: 6 máquinas mínimo para stacked (3 control plane + 3 workers) y 9 para external (3 control plane + 3 etcd + 3 workers). Los números del módulo (3 y 6) solo cuentan las máquinas de control plane/etcd y omiten los workers, lo que puede llevar a subdimensionar el laboratorio si se toman como el total del clúster.
- Corrección propuesta: aclarar explícitamente que esos números son solo de control plane/etcd, y añadir la cifra oficial de mínimo de máquinas totales (6 stacked, 9 external) incluyendo los 3 workers.
- Fuente: [Options for Highly Available topology — Kubernetes](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/) y [Creating Highly Available clusters with kubeadm — Kubernetes](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/).

### 2. "El número de control planes siempre es impar" generalizado a ambas topologías

- Ubicación: sección 4.2, título y primer párrafo.
- Gravedad: baja.
- Afirmación afectada: el número de control planes debe ser impar siempre, por el quorum de etcd.
- Problema: la regla de número impar es del **quorum de etcd**. En topología stacked, control plane y etcd coinciden 1:1, así que en la práctica el número de control planes sí queda atado a esa regla. En topología external, los apiservers (control plane) no necesitan ser un número impar; solo el clúster de etcd separado lo necesita.
- Corrección propuesta: precisar que la regla de imparidad aplica al número de miembros de etcd, y que en stacked eso implica indirectamente un número impar de control planes, mientras que en external los apiservers pueden ser cualquier cantidad ≥ 3.
- Fuente: [Options for Highly Available topology — Kubernetes](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/).

## Comprobaciones satisfactorias

- La fórmula de quorum `(n/2)+1` y todos los valores calculados en el módulo (1→1, 2→2, 3→2, 5→3, y los del laboratorio cronometrado: 1→1, 3→2, 5→3, 7→4) son correctos.
- `--control-plane-endpoint` y `--upload-certs`, su propósito y la necesidad de definir el endpoint desde el primer `init` coinciden con la documentación oficial.
- Los dos comandos `join` (control plane con `--control-plane` y `--certificate-key`; worker sin ninguno de los dos) coinciden exactamente con la documentación oficial.
- La caducidad de 2 horas de `--certificate-key` y el comando de regeneración `kubeadm init phase upload-certs --upload-certs` son correctos.
- El peso oficial del dominio "Cluster Architecture, Installation & Configuration" en el examen CKA es 25%, tal como indica el módulo.
- La alternativa K3s (`--cluster-init` en el primer server, `--server https://<host>:6443` en los siguientes, etcd embebido, número impar de servidores) coincide con la documentación oficial de K3s.
- Los bloques técnicos están cerrados, usan los cuatro roles aprobados y no contienen placeholders dentro de `bash exec` (los comandos con `<token-real-del-init>` están correctamente en bloques `yaml config` comentados, no en `bash exec`).

Fuentes: [Creating Highly Available clusters with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/), [Options for Highly Available topology](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/), [K3s HA with embedded etcd](https://docs.k3s.io/datastore/ha-embedded).
