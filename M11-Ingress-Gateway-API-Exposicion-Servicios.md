# M11 - Ingress y Gateway API, Exposición de Servicios

## 1. Resumen técnico

Este módulo cubre las dos formas de enrutar tráfico HTTP/S externo hacia Services dentro del cluster: Ingress, el mecanismo clásico y aún ampliamente usado, y Gateway API, su evolución oficial, que separa responsabilidades entre infraestructura, operador de cluster y desarrollador de aplicación, y soporta protocolos más allá de HTTP. Desde la revisión del temario, el candidato tiene acceso a gateway-api.sigs.k8s.io durante el examen, confirmando que ambos mecanismos son materia evaluable, incluyendo tareas de migración de uno a otro.

## 2. Peso en el examen y preguntas típicas

20% del examen, dominio Services & Networking. Preguntas típicas:

- Crea un Ingress que enrute tráfico hacia un Service según el host de la petición.
- Crea un Ingress con reglas de path, especificando el pathType correcto.
- Configura TLS en un Ingress usando un Secret existente.
- Crea un GatewayClass, un Gateway y un HTTPRoute que enruten tráfico hacia un Service.
- Migra un Ingress existente a Gateway API, reproduciendo el mismo comportamiento de enrutamiento.
- Un Ingress o un HTTPRoute no enruta tráfico correctamente, diagnostica por qué.

## 3. Prerrequisitos

De M06 (Helm) usarás la instalación de controllers de terceros vía Helm, exactamente el mismo patrón para instalar tanto el Ingress Controller como el Gateway Controller de este módulo.

De M10 (Services) usarás el hecho de que tanto un Ingress como una HTTPRoute enrutan tráfico hacia un Service existente, nunca directamente hacia pods.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar la diferencia entre un Ingress, una IngressClass y un Ingress Controller.
2. Crear reglas de Ingress basadas en host y en path, usando el pathType correcto.
3. Configurar TLS en un Ingress.
4. Explicar por qué surgió Gateway API y qué limitaciones de Ingress resuelve.
5. Crear los tres objetos de Gateway API, GatewayClass, Gateway y HTTPRoute, y explicar qué rol gestiona cada uno.
6. Migrar las reglas de un Ingress existente a un HTTPRoute equivalente.

## 5. Explicación teórica progresiva

### 5.1 Por qué existe Ingress

Conexión con M10: un Service NodePort abre un puerto distinto por cada aplicación, y un Service LoadBalancer pide un load balancer completo por cada aplicación, caro e innecesario cuando tienes decenas de servicios HTTP detrás de un mismo dominio. Ingress resuelve esto centralizando el enrutamiento HTTP/S: un único punto de entrada que dirige el tráfico hacia distintos Services según el host o el path de la petición, sin necesitar un load balancer por aplicación.

### 5.2 Ingress, IngressClass e Ingress Controller

Son tres piezas distintas que se confunden con facilidad.

Ingress es el objeto declarativo que define las reglas de enrutamiento: qué host, qué path, hacia qué Service. Por sí mismo, no enruta nada.

IngressClass identifica qué implementación debe procesar un Ingress dado, necesario porque pueden coexistir varios Ingress Controllers distintos en el mismo cluster. Un Ingress referencia su IngressClass en `spec.ingressClassName`; si se omite, Kubernetes usa la IngressClass marcada con la anotación `ingressclass.kubernetes.io/is-default-class: "true"`, si existe alguna.

Ingress Controller es el software real que observa los objetos Ingress vía el patrón de reconciliation loop, visto en M02, y programa un proxy real, nginx en el caso de ingress-nginx, para que el enrutamiento efectivamente ocurra. Sin un Ingress Controller corriendo, los objetos Ingress existen en etcd pero no tienen ningún efecto, el mismo comportamiento visto con los CRDs sin Operator en M06.

### 5.3 Reglas de host y path

Una regla de Ingress combina opcionalmente un host, para enrutar según el dominio de la petición, con una o más reglas de path, para enrutar según la ruta de la URL, cada una apuntando a un Service y puerto distintos.

El campo `pathType` tiene tres valores válidos. `Exact` coincide únicamente si el path de la petición es idéntico, carácter por carácter, al definido. `Prefix` coincide si el path de la petición comienza con el definido, respetando límites de segmento de la URL, `/app` coincide con `/app/mas` pero no con `/aplicacion`. `ImplementationSpecific` delega la interpretación exacta al Ingress Controller usado, y su comportamiento puede variar entre implementaciones.

### 5.4 TLS en Ingress

Un Ingress puede terminar TLS, descifrar HTTPS y pasar HTTP en claro hacia el Service, referenciando un Secret de tipo `kubernetes.io/tls` que contiene el certificado y la clave privada. Conexión con M06: este es exactamente el tipo de Secret que cert-manager genera automáticamente cuando defines un objeto Certificate, cerrando el círculo entre ambos módulos.

### 5.5 Las limitaciones de Ingress que motivan Gateway API

Ingress fue diseñado para un caso simple: un equipo, un Ingress, tráfico HTTP/S. En clusters reales con múltiples equipos compartiendo infraestructura, aparecen tres problemas. El primero es de multi-tenencia: si el equipo A gestiona un servicio web y el equipo B gestiona un servicio de video, ambos coordinando cambios sobre el mismo objeto Ingress genera fricción operativa, ya que Ingress no separa quién configura la infraestructura de quién configura las rutas de su propia aplicación. El segundo es la limitación a HTTP/S únicamente, sin soporte nativo para TCP, UDP o gRPC. El tercero es que funcionalidades avanzadas, reescritura de headers, splitting de tráfico por peso, dependen de anotaciones específicas de cada Ingress Controller, no portables entre implementaciones distintas.

### 5.6 Los objetos de Gateway API

Gateway API separa esas responsabilidades en tres objetos, gestionados típicamente por tres roles distintos dentro de una organización.

GatewayClass la configura el proveedor de infraestructura, análogo a un StorageClass o una IngressClass: define qué controller implementa esta clase de Gateway.

Gateway lo gestiona el operador del cluster: es una instancia concreta construida a partir de una GatewayClass, define los listeners, puertos, protocolos, y opcionalmente TLS, por los que entra el tráfico.

HTTPRoute, y sus variantes GRPCRoute, TCPRoute, UDPRoute, TLSRoute, la gestiona el desarrollador de la aplicación: define las reglas de enrutamiento reales, qué path o host va hacia qué Service, adjuntándose a un Gateway existente vía `parentRefs`, sin necesitar tocar la configuración de infraestructura del Gateway mismo.

Esta separación es la diferencia de fondo frente a Ingress: cada rol edita solo el objeto que le corresponde, sin coordinar cambios sobre un único recurso compartido.

### 5.7 TLS en Gateway API

Un Gateway termina TLS en su listener, con `tls.mode: Terminate` y `tls.certificateRefs` apuntando a un Secret `kubernetes.io/tls`, el mismo tipo de Secret usado en Ingress y generado por cert-manager en M06. La diferencia es que aquí el TLS se configura a nivel del Gateway, compartido por todas las HTTPRoutes que se adjunten a él, no repetido en cada regla de enrutamiento individual.

## 6. Diagrama ASCII - Ingress frente a Gateway API

```text reference
INGRESS (un solo objeto, un solo rol tipico)

  Trafico externo
       |
       v
  +----------------+       +------------------+
  |  Ingress Ctrl  |<------|     Ingress       |
  |  (ej: nginx)   |       |  host + paths +   |
  +-------+--------+       |  TLS, todo junto  |
          |                +------------------+
          v
      Service -> Pods


GATEWAY API (tres objetos, tres roles separados)

  Trafico externo
       |
       v
  +----------------+
  | Gateway Ctrl   |   <- implementa la GatewayClass
  | (ej: NGINX     |      (rol: proveedor de infra)
  |  Gateway       |
  |  Fabric)       |
  +-------+--------+
          |
          v
  +----------------+
  |    Gateway      |   <- listeners, puertos, TLS
  | (rol: operador  |
  |   del cluster)  |
  +-------+--------+
          ^
          | parentRefs
  +-------+--------+
  |   HTTPRoute     |   <- reglas de path/host
  | (rol: developer |      hacia el Service
  |  de la app)     |
  +----------------+
          |
          v
      Service -> Pods

Cada rol edita SOLO su objeto, sin coordinar cambios
sobre un unico recurso compartido como en Ingress.
```

## 7. Ejemplos prácticos desplegables

### 7.1 Instalar ingress-nginx

Retomando M06, si ya lo desinstalaste al terminar ese módulo:

```bash exec
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace --set controller.service.type=NodePort
```

`--set controller.service.type=NodePort` es necesario en este cluster bare-metal, ya que el tipo por defecto, LoadBalancer, quedaría `<pending>` indefinidamente, exactamente lo visto en M10.

```bash exec
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

```text output
NAME                                       READY   STATUS
ingress-nginx-controller-6d4f8c-x1234     1/1     Running

NAME                     TYPE       PORT(S)
ingress-nginx-controller NodePort   80:31080/TCP,443:31443/TCP
```

### 7.2 Ingress con host-based routing

```bash exec
kubectl create deployment app-tienda --image=nginx:1.25
kubectl expose deployment app-tienda --port=80
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-tienda
spec:
  ingressClassName: nginx
  rules:
  - host: tienda.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-tienda
            port:
              number: 80
EOF
```

```bash exec
kubectl get ingress ingress-tienda
```

```text output
NAME             CLASS   HOSTS          ADDRESS   PORTS
ingress-tienda   nginx   tienda.local             80
```

Probar desde cka-cp1, simulando el host con el flag de curl:

```bash exec
curl -H "Host: tienda.local" http://172.16.46.128:31080
```

```text output
<!DOCTYPE html>
<html>
<title>Welcome to nginx!</title>
...
```

### 7.3 Ingress con path-based routing

```bash exec
kubectl create deployment app-api --image=nginx:1.25
kubectl expose deployment app-api --port=80
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-multipath
spec:
  ingressClassName: nginx
  rules:
  - host: multi.local
    http:
      paths:
      - path: /tienda
        pathType: Prefix
        backend:
          service:
            name: app-tienda
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: app-api
            port:
              number: 80
EOF
```

```bash exec
curl -H "Host: multi.local" http://172.16.46.128:31080/tienda
curl -H "Host: multi.local" http://172.16.46.128:31080/api
```

Ambas rutas responden, dirigidas a Services distintos desde el mismo host.

### 7.4 TLS en Ingress

```bash exec
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout tienda.key -out tienda.crt -subj "/CN=tienda.local"

kubectl create secret tls tienda-tls --cert=tienda.crt --key=tienda.key
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-tienda-tls
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - tienda.local
    secretName: tienda-tls
  rules:
  - host: tienda.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-tienda
            port:
              number: 80
EOF
```

```bash exec
curl -k -H "Host: tienda.local" https://172.16.46.128:31443
```

`-k` acepta el certificado autofirmado, ya que no proviene de una CA reconocida.

### 7.5 Instalar Gateway API, CRDs y controller

```bash exec
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml
```

Esto instala las CRDs de GatewayClass, Gateway, HTTPRoute y ReferenceGrant. Verificar que kubectl las reconoce como cualquier tipo nativo:

```bash exec
kubectl api-resources --api-group=gateway.networking.k8s.io
```

```text output
NAME          SHORTNAMES   APIVERSION                     NAMESPACED   KIND
gatewayclasses gc          gateway.networking.k8s.io/v1   false        GatewayClass
gateways       gtw         gateway.networking.k8s.io/v1   true         Gateway
httproutes                 gateway.networking.k8s.io/v1   true         HTTPRoute
```

Instalar el controller, NGINX Gateway Fabric, vía Helm, mismo patrón de M06:

```bash exec
helm install ngf oci://ghcr.io/nginx/charts/nginx-gateway-fabric --create-namespace -n nginx-gateway --set nginx.service.type=NodePort
```

```bash exec
kubectl get pods -n nginx-gateway
```

```text output
NAME                                READY   STATUS
ngf-nginx-gateway-fabric-x1234      2/2     Running
```

### 7.6 GatewayClass, Gateway y HTTPRoute básicos

```bash exec
kubectl get gatewayclass
```

```text output
NAME    CONTROLLER
nginx   gateway.nginx.org/nginx-gateway-controller
```

NGINX Gateway Fabric ya registró su propia GatewayClass durante la instalación.

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: gateway-principal
spec:
  gatewayClassName: nginx
  listeners:
  - name: http
    protocol: HTTP
    port: 80
EOF
```

```bash exec
kubectl get gateway gateway-principal
```

```text output
NAME                CLASS   ADDRESS   PROGRAMMED   AGE
gateway-principal   nginx             True         10s
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: route-tienda
spec:
  parentRefs:
  - name: gateway-principal
  hostnames:
  - "tienda-gw.local"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: app-tienda
      port: 80
EOF
```

```bash exec
kubectl get httproute route-tienda
```

```text output
NAME            HOSTNAMES
route-tienda    ["tienda-gw.local"]
```

Probar el enrutamiento, extrayendo primero el NodePort real asignado al Service del Gateway Fabric:

```bash exec
kubectl get svc -n nginx-gateway -o jsonpath='{.items[0].spec.ports[0].nodePort}'
```

```text output
31280
```

Usar ese puerto real en la petición de prueba:

```bash exec
curl -H "Host: tienda-gw.local" http://172.16.46.128:31280
```

### 7.7 TLS con Gateway API

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: gateway-tls
spec:
  gatewayClassName: nginx
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - kind: Secret
        name: tienda-tls
EOF
```

Reutiliza el Secret `tienda-tls` creado en 7.4: el mismo tipo de Secret sirve para ambos mecanismos, Ingress y Gateway API.

## 8. Laboratorio guiado: migrar un Ingress existente a Gateway API

Objetivo: reproducir en Gateway API el comportamiento exacto de un Ingress ya funcionando, el patrón de tarea reportado en el examen actual.

Paso 1, partir del Ingress de 7.2, `ingress-tienda`, y extraer sus reglas:

```bash exec
kubectl get ingress ingress-tienda -o yaml
```

Identificar host, `tienda.local`, path, `/`, pathType, `Prefix`, y Service destino, `app-tienda:80`.

Paso 2, confirmar que ya existe un Gateway HTTP disponible, `gateway-principal` de 7.6, o crear uno si no existe.

Paso 3, crear el HTTPRoute equivalente, traduciendo cada campo del Ingress a su equivalente en Gateway API:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: route-tienda-migrada
spec:
  parentRefs:
  - name: gateway-principal
  hostnames:
  - "tienda.local"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: app-tienda
      port: 80
EOF
```

El campo `hostnames` de HTTPRoute corresponde al `host` de la regla de Ingress. `path.type: PathPrefix` corresponde a `pathType: Prefix`. `backendRefs` corresponde al bloque `backend.service` del Ingress.

Paso 4, verificar que ambos mecanismos coexisten y responden igual mientras dure la migración:

```bash exec
kubectl get httproute route-tienda-migrada -o jsonpath='{.status.parents[0].conditions}'
```

```text output
[{"type":"Accepted","status":"True",...},{"type":"ResolvedRefs","status":"True",...}]
```

Accepted en True confirma que el Gateway aceptó la ruta; ResolvedRefs en True confirma que el Service referenciado existe y fue resuelto correctamente.

Paso 5, una vez confirmado el comportamiento equivalente, eliminar el Ingress original:

```bash exec
kubectl delete ingress ingress-tienda
```

## 9. Checkpoint

**Pregunta 1**

¿Qué diferencia hay entre un Ingress, una IngressClass y un Ingress Controller?

Respuesta: el Ingress es el objeto declarativo con las reglas de enrutamiento. La IngressClass identifica qué implementación debe procesarlo. El Ingress Controller es el software real, por ejemplo nginx, que observa los objetos Ingress y programa el proxy que efectivamente enruta el tráfico.

**Pregunta 2**

¿Cuál es la diferencia entre `pathType: Exact` y `pathType: Prefix`?

Respuesta: Exact exige coincidencia carácter por carácter con el path de la petición. Prefix coincide si el path de la petición comienza con el path definido, respetando límites de segmento de URL.

**Pregunta 3**

¿Qué problema de fondo resuelve la separación de Gateway API en tres objetos, GatewayClass, Gateway y HTTPRoute, que Ingress no resuelve?

Respuesta: la falta de separación de responsabilidades entre roles. Con Ingress, un solo objeto mezcla configuración de infraestructura y reglas de aplicación, forzando a distintos equipos a coordinar cambios sobre el mismo recurso. Gateway API separa esto: GatewayClass la gestiona el proveedor de infraestructura, Gateway el operador del cluster, y HTTPRoute el desarrollador de la aplicación, cada uno editando solo su propio objeto.

**Pregunta 4**

Creaste un HTTPRoute pero el tráfico no llega al Service. ¿Qué condición del status revisarías primero?

Respuesta: `status.parents[].conditions`, específicamente Accepted, confirma si el Gateway aceptó la ruta, y ResolvedRefs, confirma si el Service referenciado en backendRefs existe y fue resuelto correctamente.

**Pregunta 5**

¿Qué tipo de Secret reutilizan tanto un Ingress como un Gateway para terminar TLS, y qué módulo ya lo generó automáticamente?

Respuesta: un Secret de tipo `kubernetes.io/tls`. cert-manager, visto en M06, genera este tipo de Secret automáticamente al definir un objeto Certificate.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 15 minutos.

Tarea:

1. Crea un Deployment app-blog con imagen nginx:1.25, y expónlo con un Service en el puerto 80.
2. Crea un Ingress ingress-blog con `ingressClassName: nginx`, host `blog.local`, path `/`, pathType Prefix, hacia app-blog.
3. Crea un Gateway gateway-blog con un listener HTTP en el puerto 80, usando la GatewayClass nginx.
4. Crea un HTTPRoute route-blog que se adjunte a gateway-blog, con hostname `blog-gw.local`, hacia el mismo Service app-blog.
5. Guarda en /tmp/ingress-class.txt la IngressClass efectiva del Ingress creado.
6. Guarda en /tmp/httproute-status.txt el valor de la condición Accepted del HTTPRoute.

Criterios de éxito:

```bash exec
cat /tmp/ingress-class.txt
cat /tmp/httproute-status.txt
```

```text output
nginx

True
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl create deployment app-blog --image=nginx:1.25
kubectl expose deployment app-blog --port=80

kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-blog
spec:
  ingressClassName: nginx
  rules:
  - host: blog.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-blog
            port:
              number: 80
EOF

kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: gateway-blog
spec:
  gatewayClassName: nginx
  listeners:
  - name: http
    protocol: HTTP
    port: 80
EOF

kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: route-blog
spec:
  parentRefs:
  - name: gateway-blog
  hostnames:
  - "blog-gw.local"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: app-blog
      port: 80
EOF

kubectl get ingress ingress-blog -o jsonpath='{.spec.ingressClassName}' > /tmp/ingress-class.txt

kubectl get httproute route-blog -o jsonpath='{.status.parents[0].conditions[?(@.type=="Accepted")].status}' > /tmp/httproute-status.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: Ingress devuelve 404 pese a que el Service existe

**Síntoma:**

Las peticiones al host configurado en el Ingress devuelven 404, aunque el Service y sus pods están Running.

Diagnóstico paso a paso:

```bash exec
kubectl describe ingress ingress-tienda
```

Revisar la sección Rules y confirmar que el host y el path de la petición coinciden exactamente con lo configurado, incluidas mayúsculas, ya que los hosts en Ingress son case-sensitive en la práctica de la mayoría de implementaciones.

```bash exec
kubectl get ingress ingress-tienda -o jsonpath='{.spec.ingressClassName}'
kubectl get ingressclass
```

Confirmar que la IngressClass referenciada existe y coincide con el Ingress Controller realmente instalado.

**Solución:**

Corregir el host o el path del Ingress, o corregir el header Host usado en la petición de prueba, para que coincidan exactamente con la configuración.

### Caso 2: Gateway no llega a Programmed=True

**Síntoma:**

`kubectl get gateway` muestra la columna PROGRAMMED en False o vacía de forma persistente.

Diagnóstico paso a paso:

```bash exec
kubectl describe gateway gateway-principal
```

Revisar Conditions y Events. Causas comunes: la GatewayClass referenciada no existe, o el controller correspondiente no está corriendo.

```bash exec
kubectl get gatewayclass
kubectl get pods -n nginx-gateway
```

**Solución:**

Corregir `gatewayClassName` si no coincide con ninguna GatewayClass registrada, o revisar por qué el controller del Gateway no está Running, siguiendo el mismo patrón de diagnóstico de pods visto en módulos anteriores.

### Caso 3: HTTPRoute creado pero sin efecto

**Síntoma:**

El HTTPRoute existe y no muestra errores obvios, pero el tráfico hacia su hostname no llega al Service.

Diagnóstico paso a paso:

```bash exec
kubectl get httproute route-tienda-migrada -o jsonpath='{.status.parents}'
```

Si Accepted es False, el problema está en `parentRefs`: el nombre del Gateway referenciado no coincide con ninguno existente, o el listener del Gateway no acepta el hostname de la ruta. Si Accepted es True pero ResolvedRefs es False, el problema está en `backendRefs`: el Service referenciado no existe o el puerto no coincide.

```bash exec
kubectl get gateway gateway-principal -o jsonpath='{.spec.listeners}'
kubectl get svc app-tienda
```

**Solución:**

Corregir el `parentRefs` para que apunte al nombre correcto del Gateway, o corregir `backendRefs` para que apunte al Service y puerto reales.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Ambos mecanismos, Ingress y Gateway API, funcionan igual en cualquier topología de Kubernetes; el laboratorio usa NodePort explícitamente porque el tipo LoadBalancer por defecto de ambos controllers quedaría `<pending>` en este entorno bare-metal, como ya viste en M10.

**Alternativa K3s (plan B):** Ingress y Gateway API funcionan idéntico, son API estándar de Kubernetes. K3s instala Traefik como Ingress Controller por defecto, a diferencia de este cluster que instala ingress-nginx explícitamente vía Helm; si practicas en K3s, la IngressClass por defecto se llamará `traefik`, no `nginx`. K3s no incluye un Gateway Controller por defecto; instalar uno sigue el mismo procedimiento de este módulo.

Limpieza del módulo:

```bash exec
kubectl delete ingress ingress-multipath ingress-tienda-tls ingress-blog
kubectl delete gateway gateway-principal gateway-tls gateway-blog
kubectl delete httproute route-tienda route-tienda-migrada route-blog
kubectl delete deployment app-tienda app-api app-blog
kubectl delete svc app-tienda app-api app-blog
kubectl delete secret tienda-tls
rm -f tienda.key tienda.crt
helm uninstall ingress-nginx -n ingress-nginx
helm uninstall ngf -n nginx-gateway
kubectl delete namespace ingress-nginx nginx-gateway
```

---

**Siguiente módulo:** M12 - NetworkPolicy y Segmentación