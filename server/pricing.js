// VOLTECH — Motor de precios
// Reproduce EXACTAMENTE la lógica comercial del Excel (hoja "Todos" + "Configuracion"),
// transformada en reglas de negocio de backend.
//
// Compatibilidad con el Excel:
//   Precio final USD          = netoUSD × (1 + IVA)
//   Costo efectivo ARS        = finalUSD × dólar × (1 − descuentoComercialProveedor)   [costo real de Voltech]
//   Precio de venta (s/ desc) = costoEfectivoARS × (1 + margen)                          [margen = MARKUP sobre costo]
//   Precio final unitario     = precioVenta × (1 − descuentoCliente)
//   Total línea               = precioFinalUnitario × cantidad
//
// El "Margen de ganancia" del Excel es matemáticamente un MARKUP sobre costo.
// Se conserva esa lógica para compatibilidad, pero además exponemos el
// margen REAL sobre ventas = ganancia / venta × 100 (para el dashboard).

/**
 * Calcula todos los valores de una línea de presupuesto.
 * Todos los descuentos/márgenes son FRACCIONES (0.10 = 10%).
 */
export function computeLine({
  netUSD,
  iva = 0,
  dollar,
  commercialDiscount = 0, // descuento comercial del proveedor
  margin = 0,             // markup sobre costo
  clientDiscount = 0,     // descuento adicional al cliente
  qty = 1,
}) {
  netUSD = Number(netUSD) || 0;
  iva = Number(iva) || 0;
  dollar = Number(dollar) || 0;
  commercialDiscount = Number(commercialDiscount) || 0;
  margin = Number(margin) || 0;
  clientDiscount = Number(clientDiscount) || 0;
  qty = Number(qty) || 0;

  const finalUSD = netUSD * (1 + iva);
  const costARS = finalUSD * dollar * (1 - commercialDiscount); // costo efectivo de Voltech
  const salePrice = costARS * (1 + margin);                     // venta antes de descuento cliente
  const finalUnit = salePrice * (1 - clientDiscount);           // precio unitario final al cliente
  const lineTotal = finalUnit * qty;

  const profitUnit = finalUnit - costARS;
  const profitLine = profitUnit * qty;
  const marginOnSalesPct = finalUnit > 0 ? (profitUnit / finalUnit) * 100 : 0; // margen real sobre ventas
  const markupPct = costARS > 0 ? (profitUnit / costARS) * 100 : 0;            // markup sobre costo

  return {
    finalUSD,
    costARS,
    salePrice,
    finalUnit,
    lineTotal,
    profitUnit,
    profitLine,
    marginOnSalesPct,
    markupPct,
  };
}

/**
 * Resume un presupuesto completo a partir de sus líneas + extras.
 * Cada item: { netUSD, iva, qty, clientDiscount, ...params } ya resuelto por computeLine.
 */
export function computeQuoteTotals(lines, extras = 0) {
  let subtotal = 0;   // suma de venta antes de descuento cliente
  let total = 0;      // suma de totales de línea (con descuento cliente)
  let cost = 0;       // costo total de productos (Voltech)
  let profit = 0;     // ganancia total sobre productos

  for (const l of lines) {
    subtotal += l.salePrice * l.qty;
    total += l.lineTotal;
    cost += l.costARS * l.qty;
    profit += l.profitLine;
  }

  const discountAmount = subtotal - total;   // descuento comercial otorgado
  const grandTotal = total + Number(extras || 0);
  const marginOnSalesPct = grandTotal > 0 ? ((grandTotal - cost) / grandTotal) * 100 : 0;

  return {
    subtotal,
    discountAmount,
    extras: Number(extras || 0),
    total: grandTotal,
    cost,
    profit: grandTotal - cost, // ganancia incluyendo extras como ingreso adicional
    productProfit: profit,
    marginOnSalesPct,
  };
}

/** Redondeo a 2 decimales (helper para snapshots). */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
