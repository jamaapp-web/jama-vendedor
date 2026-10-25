import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Probando Nueva API de Productos y Ventas Locales ---');

  // Buscamos el negocio para hacer la prueba
  const negocio = await prisma.negocio.findFirst();
  if (!negocio) return console.log('No hay negocio, corre test-billetera primero.');

  // 1. El vendedor da de alta sus tacos con opciones
  const resProducto = await fetch('http://localhost:3000/api/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      negocioId: negocio.id,
      nombre: 'Orden de Tacos de Asada',
      precio: 60.0,
      opciones: [
        { nombre: 'Sin cebolla', precioExtra: 0 },
        { nombre: 'Con todo', precioExtra: 0 },
        { nombre: 'Extra aguacate', precioExtra: 15.0 }
      ]
    })
  });
  const producto = await resProducto.json();
  console.log(`🍔 Producto creado: ${producto.nombre}`);

  // 2. Llega un cliente físico al local (Venta LOCAL - Cero comisión)
  const resPedido = await fetch('http://localhost:3000/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      negocioId: negocio.id,
      tipoVenta: 'LOCAL',
      detalles: [
        { 
          productoId: producto.id, 
          cantidad: 2, 
          subtotal: 120.0, 
          notas: 'Sin cebolla, bien dorados' 
        }
      ]
    })
  });
  const pedido = await resPedido.json();
  console.log(`🛒 Venta Local Registrada | Total: $${pedido.total} | Comisión cobrada: $${pedido.comision}`);
  console.log(`📝 Notas para la cocina: ${pedido.detalles[0].notas}`);
}

main();