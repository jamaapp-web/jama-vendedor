import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Simulador de Billetera ---');

  // 1. Crear un Cliente y el Dueño de la taquería
  const cliente = await prisma.usuario.create({
    data: { nombre: 'Juan Cliente', telefono: `311${Math.floor(Math.random() * 10000000)}`, rol: 'CLIENTE' }
  });
  const dueno = await prisma.usuario.create({
    data: { nombre: 'Don Taquero', telefono: `311${Math.floor(Math.random() * 10000000)}`, rol: 'ADMIN' }
  });

  // 2. Dar de alta el Negocio con $100 de saldo inicial
  const negocio = await prisma.negocio.create({
    data: {
      nombre: 'Tacos El Gordo - Xalisco',
      latitud: 21.4398, 
      longitud: -104.8933,
      saldo: 100.0,
      duenoId: dueno.id
    }
  });
  console.log(`✅ Negocio creado: ${negocio.nombre} | Saldo: $${negocio.saldo} | Activo: ${negocio.estaActivo}`);

  // 3. Venta 1: Pedido de $500 pesos (Comisión de $40)
  const total1 = 500;
  const comision1 = total1 * 0.08;
  let nuevoSaldo = negocio.saldo - comision1;
  let activo = nuevoSaldo >= 10;

  await prisma.$transaction([
    prisma.pedido.create({
      data: { negocioId: negocio.id, clienteId: cliente.id, total: total1, comision: comision1, nipEntrega: '1234' }
    }),
    prisma.negocio.update({
      where: { id: negocio.id },
      data: { saldo: nuevoSaldo, estaActivo: activo }
    })
  ]);
  console.log(`🛒 Venta 1 ($${total1}) | Comisión: $${comision1} | Te quedan: $${nuevoSaldo} | Activo: ${activo}`);

  // 4. Venta 2: Pedido de $700 pesos (Comisión de $56) - Esto forzará el apagón
  const total2 = 700;
  const comision2 = total2 * 0.08;
  nuevoSaldo = nuevoSaldo - comision2;
  activo = nuevoSaldo >= 10;

  await prisma.$transaction([
    prisma.pedido.create({
      data: { negocioId: negocio.id, clienteId: cliente.id, total: total2, comision: comision2, nipEntrega: '5678' }
    }),
    prisma.negocio.update({
      where: { id: negocio.id },
      data: { saldo: nuevoSaldo, estaActivo: activo }
    })
  ]);
  console.log(`🛒 Venta 2 ($${total2}) | Comisión: $${comision2} | Te quedan: $${nuevoSaldo} | Activo: ${activo}`);

  if (!activo) {
    console.log('🚨 ¡Bloqueo automático! El negocio bajó del límite de $10 pesos y fue ocultado de la app.');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());