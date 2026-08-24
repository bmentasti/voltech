# ⚡ VOLTECH — Presupuestos & Gestión

Aplicación web para gestión comercial de Voltech. Esta entrega es el **núcleo del cotizador
end-to-end**, con los 170 productos reales importados del Excel `Lista de Precios Julian Actualizada.xlsx`.

> **Arquitectura elegida:** app autónoma que corre de inmediato, con persistencia local real
> (SQLite embebido). **No requiere instalar nada** — usa solo módulos nativos de Node.js 22.

---

## ▶ Cómo ejecutarla

Necesitás **Node.js 18 o superior** ([descargar](https://nodejs.org)). Después:

```bash
cd voltech
npm install     # instala better-sqlite3 (solo la primera vez)
npm start
```

Abrí el navegador en **http://localhost:3000**

- **Usuario:** `Voltech`
- **Contraseña:** `Lauti123`

La primera vez, la app crea la base de datos, siembra el usuario admin (contraseña
hasheada con scrypt, nunca en texto plano) e **importa los 170 productos** del Excel.

Otros comandos:

```bash
npm test        # corre los tests del motor de precios (8 tests)
npm run dev     # modo desarrollo con recarga automática
npm run reset-db  # borra la base para volver a sembrar desde cero
```

---

## ✅ Qué incluye esta etapa (núcleo cotizador)

| Requisito del prompt | Estado |
|---|---|
| Login seguro (scrypt, sesiones httpOnly, rutas protegidas) | ✔ |
| Cambio de contraseña | ✔ |
| Importación inicial del Excel (170 productos, 18 categorías, 7 familias) | ✔ |
| Familias y categorías dinámicas (no hardcodeadas) | ✔ |
| Dólar oficial en vivo (dolarapi + respaldo bluelytics + manual) | ✔ |
| Snapshot de dólar por presupuesto + aviso de variación | ✔ |
| Catálogo de productos con búsqueda instantánea y filtros | ✔ |
| Precio USD y ARS calculados con la lógica del Excel | ✔ |
| CRM de clientes | ✔ |
| Cotizador rápido (buscar, agregar, cantidades, descuentos en vivo) | ✔ |
| Costo / venta / ganancia / margen **interno** (no sale en PDF) | ✔ |
| Alerta si el margen < mínimo y si la seña no cubre las compras | ✔ |
| Numeración `VOL-2026-0001` | ✔ |
| Snapshot inmutable de cada línea (preservación histórica) | ✔ |
| PDF profesional + Imprimir + Copiar para WhatsApp | ✔ |
| Estados de presupuesto + motivo de pérdida + actividad | ✔ |
| Dashboard con KPIs del mes | ✔ |
| Configuración comercial + datos de empresa para el PDF | ✔ |
| Auditoría de acciones (audit_log) | ✔ |
| Tests automáticos de la lógica de precios | ✔ |

## ✅ Etapa 2 (gestión completa)

| Módulo | Estado |
|---|---|
| **Compras** — proveedor, ítems, costo USD/ARS, dólar del momento, estados, link a presupuesto | ✔ |
| **Cobros & Señas** — múltiples pagos por presupuesto, métodos, saldos por presupuesto | ✔ |
| **Gastos** — categorías configurables, únicos/recurrentes, gastos directos por trabajo | ✔ |
| **Ganancia real vs estimada** — costo real (compras) + gastos, desvío, impacto del dólar | ✔ |
| **Seña recomendada / capital a financiar** — avisa si la seña no cubre las compras | ✔ |
| **Estadísticas** — comerciales, rentabilidad, cobros, compras y estado de resultados operativo | ✔ |
| **Actualizar precios (Excel)** — subir lista → preview de diferencias → confirmar (transaccional) | ✔ |
| Detección: nuevos / actualizados / sin cambios / discontinuados / duplicados / errores / revisión manual | ✔ |
| Productos que desaparecen se marcan **discontinuados** (nunca se borran) | ✔ |
| Historial de precios por producto + historial de importaciones | ✔ |
| Presupuestos históricos NO se recalculan al cambiar la lista | ✔ |
| **Dólar automático cada 30 min** (configurable en Configuración) | ✔ |
| Dashboard ampliado (cobros, compras, ganancia, saldos, capital a financiar) | ✔ |
| Tests de la lógica del importador (diff, normalización, IVA) | ✔ |

### Prueba de compatibilidad (sección 43 del prompt)
El test verifica el producto `E02306300` (neto 87,20 / IVA 10,5% / dólar 1500):
**Precio final USD = 96,356** y **ARS = $144.534** ✔ (idéntico al Excel).

---

## 🔜 Próximas mejoras posibles

Versionado V2/V3 de presupuestos · vista Kanban · alertas/insights automáticos en el dashboard ·
gestión de stock · exportaciones a Excel/CSV · roles de usuario (vendedor / solo lectura).

---

## 🧮 Lógica de precios (idéntica al Excel, documentada)

```
Precio final USD       = netoUSD × (1 + IVA)
Costo efectivo ARS     = finalUSD × dólar × (1 − descuentoComercialProveedor)   ← costo de Voltech
Precio de venta        = costoEfectivoARS × (1 + margen)      ← "margen" = MARKUP sobre costo
Precio final unitario  = precioVenta × (1 − descuentoCliente)
Total línea            = precioFinalUnitario × cantidad
```

El "Margen de ganancia" del Excel es matemáticamente un **markup sobre costo**; se conserva esa
lógica para compatibilidad y además el dashboard muestra el **margen real sobre ventas**
(`ganancia / venta × 100`). Ver comentarios en `server/pricing.js`.

---

## 🗂 Estructura

```
voltech/
├── package.json
├── server/
│   ├── index.js        Servidor HTTP + API REST (sin dependencias externas)
│   ├── db.js           SQLite (node:sqlite), esquema y siembra desde el Excel
│   ├── pricing.js      Motor de precios (compatible con el Excel)
│   ├── auth.js         Hashing scrypt + tokens de sesión
│   ├── exchange.js     ExchangeRateProvider (dólar oficial + respaldo + manual)
│   └── data/
│       └── seed.json   170 productos + config, extraídos del Excel
├── public/             Frontend (dark-first, identidad Voltech)
│   ├── index.html · styles.css · app.js · logo.jpeg
└── test/
    └── pricing.test.js
```

## 🎨 Identidad visual
Negro `#0A0A0A`, azul eléctrico `#0283EB`, blanco. UI dark-first, español (es-AR), fechas DD/MM/YYYY,
montos en ARS y USD.

## 🔒 Notas de seguridad
- Contraseña con hash **scrypt** + salt aleatorio. Nunca en texto plano ni en el frontend.
- Sesiones con cookie `HttpOnly` + `SameSite=Lax`, con expiración.
- Toda ruta `/api/*` (salvo login) exige sesión válida.
- La base de datos puede reubicarse con la variable de entorno `VOLTECH_DB`.
