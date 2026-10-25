import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Buscamos el primer negocio que tengamos (el que bloqueamos en el paso anterior)
  const negocio = await prisma.negocio.findFirst();
  
  if (!negocio) {
    console.log('No hay negocios para recargar.');
    return;
  }

  console.log(`Intentando recargar el negocio: ${negocio.nombre}...`);

  // Hacemos una petición falsa simulando un depósito de $150
  const respuesta = await fetch('http://localhost:3000/api/recarga', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ negocioId: negocio.id, monto: 150 })
  });

  const data = await respuesta.json();
  console.log('Respuesta del servidor:', data);
}

main().finally(async () => await prisma.$disconnect());