# Cordar Cadires

Aplicación web de una sola página para crear patrones de cordado, tejido o cestería sobre una cuadrícula editable. Está pensada para artesanos que necesitan dibujar un motivo y convertirlo en instrucciones de trabajo por columnas.

## Funcionalidad

- Definir el número de filas y columnas de la cuadrícula (área activa).
- Pintar o borrar celdas haciendo clic y arrastrando.
- Seleccionar, mover, copiar, cortar y pegar regiones; el movimiento arrastra solo los píxeles pintados.
- Deshacer y rehacer, con zoom y desplazamiento (pan) del lienzo.
- Conservar como _overflow_ los píxeles que quedan fuera al encoger el lienzo, en las cuatro direcciones.
- Importar una imagen PNG, JPG o WebP y convertirla a pixel art sobre la cuadrícula.
- Mover la previsualización de la imagen importada y fijarla con un botón, clic fuera o Enter.
- Cambiar al modo **Tejer** para generar instrucciones columna por columna.
- Elegir la lectura de cada columna de arriba hacia abajo o de abajo hacia arriba.
- Resaltar la columna actual mientras se revisan las instrucciones.
- Exportar el área activa como PNG plano a tamaño píxel 1× (pintado = negro, vacío = blanco).
- Compartir el diseño completo (overflow incluido) y su configuración en un enlace, que se carga al abrirlo.
- Instalar como aplicación (PWA) y usarla sin conexión.

## Estructura

```text
.
├── index.html
├── styles.css
├── manifest.json        # Web App Manifest (PWA)
├── sw.js                # Service worker (caché offline)
├── assets/
│   ├── icons/           # Iconos de los botones de la interfaz
│   ├── brand/           # Icono de la app, favicon, iconos PWA y la imagen Open Graph
│   └── sources/         # SVG fuente para regenerar los PNG (no se sirven)
└── js
    ├── app.js
    ├── exporter.js
    ├── gridCanvas.js
    ├── imageImporter.js
    ├── share.js          # Codificar/cargar el diseño desde la URL
    ├── state.js
    └── weaving.js
```

La app no requiere instalación de dependencias. Usa HTML, CSS y JavaScript moderno con módulos ES.

## Ejecutar en local

Desde la carpeta del proyecto:

```bash
python3 -m http.server 8000
```

Después abre en el navegador:

```text
http://127.0.0.1:8000/
```

También puedes usar otro puerto si el `8000` ya está ocupado:

```bash
python3 -m http.server 8080
```

## Apagar el servidor local

En la terminal donde está corriendo el servidor, pulsa:

```text
Ctrl + C
```

Si el servidor fue iniciado por Codex en esta sesión, se puede cerrar desde aquí cuando ya no haga falta.

## Uso básico

1. Ajusta **Filas** y **Columnas**.
2. Usa **Pintar** o **Borrar** para editar manualmente el patrón.
3. Opcionalmente importa una imagen, ajusta su tamaño, arrástrala sobre la cuadrícula y pulsa **Fijar**.
4. Cambia a **Tejer** para ver las instrucciones generadas por columna.
5. Usa las flechas o haz clic en una instrucción para cambiar la columna resaltada.
6. Pulsa **Exportar diseño PNG** para descargar el patrón, o **Copiar enlace del diseño** para compartirlo por URL.

## Instalar como app (PWA)

La app incluye un _manifest_ y un _service worker_, por lo que se puede instalar y usar sin conexión. El service worker solo se activa en un contexto seguro (HTTPS o `localhost`); al abrir el `index.html` directamente como `file://` no se registrará, pero la app sigue funcionando.

- En local: sírvela con `python3 -m http.server` y abre `http://localhost:8000`.
- En producción: cualquier hosting estático con HTTPS (por ejemplo GitHub Pages) permite instalarla desde el navegador.

La caché es _cache-first_ con versión: para publicar cambios, sube la constante `VERSION` en `sw.js` y el service worker reemplazará la caché antigua.

## Nota sobre las instrucciones

En el modo **Tejer**, cada columna se lee según la dirección seleccionada. Las celdas pintadas se traducen como `por encima` y las celdas vacías como `por debajo`.

Las instrucciones se muestran como una lista de números:

- Caja rellena: tramo `por encima`.
- Caja vacía: tramo `por debajo`.
- Número: cantidad de celdas consecutivas de ese tramo.
