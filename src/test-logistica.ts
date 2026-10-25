import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Fórmula matemática para calcular distancia real en Kilómetros entre dos puntos GPS
function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function main() {
  console.log('--- Buscando al Mandadito Más Cercano ---');

  // 1. Creamos un repartidor de prueba cerca de Xalisco
  const repartidor = await prisma.usuario.create({
    data: { 
      nombre: 'Paco el Mandadito', 
      telefono: `311${Math.floor(Math.random() * 10000000)}`, 
      rol: 'REPARTIDOR',
      latitudActual: 21.4400, // Cerca del negocio
      longitudActual: -104.8940
    }
  });

  // 2. Buscamos el negocio y un pedido que necesite repartidor
  const negocio = await prisma.negocio.findFirst();
  const pedido = await prisma.pedido.findFirst({ where: { estatus: 'BUSCANDO_REPARTIDOR' } });

  if (!negocio || !pedido) {
    console.log('No hay pedidos pendientes de asignar.');
    return;
  }

  // 3. Calculamos a qué distancia está Paco de la taquería
  const distanciaKm = calcularDistancia(
    negocio.latitud, negocio.longitud, 
    repartidor.latitudActual!, repartidor.longitudActual!
  );
  
  console.log(`📍 Paco está a ${distanciaKm.toFixed(2)} km del negocio.`);

  // 4. Si está a menos de 3 km, le asignamos el pedido
  if (distanciaKm <= 3.0) {
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: { repartidorId: repartidor.id, estatus: 'EN_CAMINO' }
    });
    console.log(`✅ Pedido asignado a Paco. Va en camino al cliente.`);
    
    // 5. El cliente le da el NIP a Paco en la puerta de su casa
    const nipIngresado = pedido.nipEntrega; // Simulamos que Paco teclea el NIP
    
    if (nipIngresado === pedido.nipEntrega) {
      await prisma.pedido.update({
        where: { id: pedido.id },
        data: { estatus: 'ENTREGADO' }
      });
      console.log('🎉 NIP correcto. ¡Entregado con éxito y cobrado!');
    } else {
      console.log('❌ NIP incorrecto. No se puede entregar.');
    }
  } else {
    console.log('Paco está muy lejos, buscando a otro...');
  }
}

main().finally(async () => await prisma.$disconnect());