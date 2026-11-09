# Revisión técnica — M09

Fecha de revisión: 2026-11-09.

Fuente activa revisada: `src/content/modulos/scheduling-avanzado-affinity-taints-priority.md`. El archivo `M09-Scheduling-Affinity-Taints-Tolerations-PriorityClasses.md` de la raíz se conserva como referencia anterior y no genera la web.

Estado: correcciones aplicadas por solicitud del propietario. Esta revisión sustituye el informe del 2026-09-08, que validó erróneamente la inmutabilidad completa de `spec.tolerations` y no detectó las inconsistencias de anti-affinity y de los laboratorios. Añadidas la limpieza intermedia antes del laboratorio 8 y la limpieza final antes de M10.

## Alcance CKA

El [temario oficial de CKA — Linux Foundation](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) incluye configurar la admisión y el scheduling de pods, con node affinity como ejemplo, dentro de Workloads & Scheduling (15% del examen). Ese peso corresponde al dominio completo, compartido con otros módulos.

Las explicaciones se centran en interpretar manifiestos, diagnosticar Pending, corregir tolerations, distinguir required de preferred y verificar la asignación al nodo. Son prácticas alineadas con ese objetivo amplio; el temario público no garantiza tareas concretas sobre cada campo. No se añaden operadores experimentales de tolerations, configuración de plugins del scheduler ni cambios de admission controllers para habilitar otras topologías de anti-affinity.

## Correcciones aplicadas

### 1. Añadir tolerations a un pod existente

Secciones 8 y 11, caso 2. El informe anterior y el módulo afirmaban que añadir tolerations mediante patch o edit estaba prohibido. La API permite añadir entradas, conservando las existentes. El patch ahora utiliza `/spec/tolerations/-` sobre la lista que ya crea la admisión del cluster kubeadm. Se explica también el caso de una lista inicialmente ausente y la diferencia entre añadir una entrada y sustituir toda la propiedad.

El laboratorio resuelve el bloqueo sin recrear innecesariamente el pod. El troubleshooting reserva la recreación para modificar o retirar tolerations existentes y explica la actualización del template de un Deployment.

Fuente: [Pod update and replacement — Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/#pod-update-and-replacement), comprobado también en la [documentación de Kubernetes 1.35](https://v1-35.docs.kubernetes.io/docs/concepts/workloads/pods/#pod-update-and-replacement), versión de referencia declarada por el curso.

### 2. Anti-affinity, selector y dominio de topología

Secciones 5.3 y 9, pregunta 2. La separación obligatoria por zona de pods seleccionados por la misma regla también impide compartir nodo. La afirmación contraria era incorrecta. Se distingue required de preferred y se aclara que la regla se aplica a los pods seleccionados y a los dominios definidos por las labels de los nodos.

El checkpoint usa ahora el escenario del ejemplo desplegable: tres réplicas, dos nodos elegibles y anti-affinity requerida por hostname. La tercera queda Pending; con preferred, podría compartir nodo si cumple los demás requisitos.

Fuente: [Inter-pod affinity and anti-affinity — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#inter-pod-affinity-and-anti-affinity).

### 3. Taints simultáneos en el ejemplo NoExecute

Sección 7.6. Añadir `equipo=facturacion:NoExecute` no elimina el taint NoSchedule de 7.5. El pod temporal toleraba solo NoExecute y quedaba bloqueado por NoSchedule. El manifiesto incluye ahora ambas tolerations y explica por qué son necesarias. También se aclara el inicio del plazo de tolerancia y que un pod independiente eliminado no se recrea automáticamente.

Sección 5.4. Se corrige la afirmación de que Equal exige siempre un efecto explícito: omitir effect admite todos los efectos de esa clave con Equal o Exists.

Fuente: [Taints and Tolerations — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/).

### 4. Afinidad y diagnóstico del laboratorio guiado

Sección 8. La afinidad permitía cka-worker2, pero el diagnóstico lo presentaba como excluido por ella. Ahora solo permite cka-worker1 y el taint de mantenimiento bloquea precisamente ese nodo. La corrección conserva la afinidad y añade la toleration necesaria.

Secciones 8 y 11. FailedScheduling agrupa motivos y cantidades; no proporciona necesariamente una relación individual entre cada nodo y su causa. Se muestra un fragmento orientativo y se contrasta con labels y taints reales. Se añade la comprobación de PodScheduled tras el patch.

Fuente: [Assigning Pods to Nodes — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/).

### 5. Precisiones relacionadas con el diagnóstico

- Secciones 5.4 y 9: los 300 segundos se cuentan desde la aplicación del taint; las tolerations reales pueden diferir y los DaemonSets toleran not-ready/unreachable sin límite. La creación de sustitutos corresponde al controller.
- Secciones 5.5 y 6: la preemption depende de la prioridad efectiva y de la política del pod; no exige una PriorityClass explícita ni permite ignorar taints o node affinity. El diagrama incluye anti-affinity requerida.
- Secciones 5.2, 7.3 y 9: incumplir una preferencia no bloquea el scheduling, pero siguen siendo necesarios nodos que cumplan los requisitos obligatorios. El nodo elegido en 7.3 es un resultado posible, no una salida determinista.
- Sección 11, caso 3: prioridad 0 es el valor por defecto sin globalDefault, pero existen prioridades negativas y no hay garantía de que sea la primera víctima.

Fuentes: [Taints and Tolerations — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/), [Pod Priority and Preemption — Kubernetes](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/).

### 6. Limpieza entre prácticas y al finalizar

Sección 7.8: elimina los Deployments, sus pods, los pods independientes, las PriorityClasses, las labels y los taints de los ejemplos antes del laboratorio 8. La limpieza final incluye también los recursos de los laboratorios 8 y 10 y `/tmp/nodo-critico.txt`. Ambas incluyen comprobaciones; los borrados de recursos toleran objetos ya eliminados y se explican los avisos por labels o taints ausentes.

## Verificación

La revisión contrasta la semántica con documentación oficial. Las comprobaciones locales incluyen Astro check, las pruebas existentes, la validación de contenido, el build y la validación de sus artefactos, además de la sintaxis Bash y el parseo de manifiestos YAML. Se revisa la cobertura de los recursos de cada limpieza, la afinidad del laboratorio y ambas tolerations del pod temporal.

Estas comprobaciones no sustituyen la ejecución de los laboratorios en un cluster kubeadm; no se presenta esa ejecución como realizada.
