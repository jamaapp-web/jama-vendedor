import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- 1. Sistema de Calificaciones ---');

  // Buscamos el pedido que Paco acaba de entregar en la fase anterior
  const pedido = await prisma.pedido.findFirst({ 
    where: { estatus: 'ENTREGADO' }, 
    include: { repartidor: true } 
  });

  if (!pedido || !pedido.repartidor) {
    console.log('No hay pedidos entregados para calificar.');
    return;
  }

  // Simulamos que el cliente le pone 2 estrellas porque llegó tarde
  const calificacionNueva = 2.0;
  const calificacionAnterior = pedido.repartidor.calificacion; // Por defecto es 5.0
  
  // Promediamos la calificación
  const promedio = (calificacionAnterior + calificacionNueva) / 2;

  await prisma.usuario.update({
    where: { id: pedido.repartidor.id },
    data: { calificacion: promedio }
  });

  console.log(`⭐ El cliente calificó a ${pedido.repartidor.nombre} con ${calificacionNueva} estrellas.`);
  console.log(`📊 Promedio actual del repartidor: ${promedio}`);

  // Regla dura: Si el promedio baja de 3.5, lo mandamos a la banca
  if (promedio <= 3.5) {
    console.log('🚨 ALERTA: El mandadito bajó de 3.5 estrellas. ¡Bloqueado de la plataforma por mal servicio!');
  } else {
    console.log('✅ El repartidor mantiene buen nivel.');
  }

  console.log('\n--- 2. Barredora de Negocios Inactivos (60 días) ---');
  
  // Calculamos la fecha de hace 60 días
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - 60);

  // Apagamos todos los negocios que no han tenido actividad
  const negociosLimpiados = await prisma.negocio.updateMany({
    where: { 
      creadoEn: { lt: fechaLimite }, // En producción esto miraría la fecha del último pedido
      estaActivo: true 
    },
    data: { estaActivo: false }
  });

  console.log(`🧹 Limpieza terminada: ${negociosLimpiados.count} negocios fueron dados de baja por inactividad.`);
}

main().finally(async () => await prisma.$disconnect());