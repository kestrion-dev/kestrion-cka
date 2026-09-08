# Reglas para generar módulos Markdown

Entrega estas instrucciones al agente que genera cada módulo:

````text
Genera el módulo como un archivo Markdown (.md) descargable.

FORMATO

1. Usa # para el título, ## para las secciones y ### para las subsecciones.

2. Todo bloque técnico usa uno de estos formatos:
   ```bash exec
   Comandos pegables y ejecutables sin editar.
   ```

   ```yaml config
   Manifiestos independientes para guardar o editar.
   ```

   ```text output
   Resultados o salidas esperadas.
   ```

   ```text reference
   Diagramas ASCII o patrones de comando que requieren sustitución.
   ```

3. Nunca mezcles comandos y salidas en el mismo bloque.

4. Un heredoc permanece completo dentro de un único bloque bash exec:
   comando, contenido YAML y cierre EOF. El EOF final debe estar en la
   columna 0, sin indentación.

5. Cuando un manifiesto se guarde para editarlo, colócalo en un bloque
   yaml config y después usa un bloque bash exec separado para aplicarlo.

6. Ningún bloque bash exec puede contener placeholders como <algo>.
   Si el lector debe sustituir un valor, usa text reference y explícalo
   en la prosa. Si el valor real es conocido, úsalo directamente.

7. "Síntoma:" y "Solución:" van en líneas propias. La línea posterior
   debe comenzar con una explicación, no directamente con un comando.

8. Ningún párrafo empieza como "campo: explicación". Escríbelo como
   una oración completa.

9. Entrega un archivo .md real y descargable, no el contenido pegado en
   el chat.
````

El agente generador no decide slugs, URLs, orden, identificadores, frontmatter ni metadatos SEO. El repositorio añade y valida esos datos al incorporar el módulo.
