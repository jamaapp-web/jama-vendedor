import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// 1. Crear un producto con modificadores
app.post('/api/productos', async (req, res) => {
  const { negocioId, nombre, precio, opciones } = req.body;
  try {
    const producto = await prisma.producto.create({
      data: {
        negocioId,
        nombre,
        precio,
        opciones: {
          create: opciones
        }
      },
      include: { opciones: true }
    });
    res.json(producto);
  } catch (error) {
    console.error("Error al crear el producto:", error);
    res.status(500).json({ error: 'Fallo al crear el producto' });
  }
});

// 2. Crear un pedido (Local o a Domicilio)
app.post('/api/pedidos', async (req, res) => {
  const { negocioId, clienteId, tipoVenta, detalles } = req.body;
  
  try {
    const total = detalles.reduce((acc: number, item: any) => acc + item.subtotal, 0);
    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId } });
    
    // Regla de oro: Cero comisión en venta LOCAL. 8% en DOMICILIO.
    const comision = (tipoVenta === 'LOCAL') ? 0 : (total * 0.08);

    const pedido = await prisma.pedido.create({
      data: {
        negocioId,
        clienteId,
        tipoVenta,
        total,
        comision,
        estatus: tipoVenta === 'LOCAL' ? 'COMPLETADO_LOCAL' : 'BUSCANDO_REPARTIDOR',
        nipEntrega: tipoVenta === 'LOCAL' ? null : Math.floor(1000 + Math.random() * 9000).toString(),
        detalles: { create: detalles }
      },
      include: { detalles: true }
    });
    
    if (comision > 0 && negocio) {
      await prisma.negocio.update({
        where: { id: negocioId },
        data: { 
          saldo: negocio.saldo - comision,
          estaActivo: (negocio.saldo - comision) >= 10
        }
      });
    }

    res.json(pedido);
  } catch (error) {
    console.error("Error al crear el pedido:", error);
    res.status(500).json({ error: 'Fallo al crear el pedido' });
  }
});

// 3. Ver panel de pedidos activos (Para la pantalla del vendedor)
app.get('/api/negocios/:id/pedidos', async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: { 
        negocioId: req.params.id, 
        estatus: { notIn: ['CANCELADO', 'COMPLETADO_LOCAL', 'ENTREGADO'] } 
      },
      include: { detalles: { include: { producto: true } } }
    });
    res.json(pedidos);
  } catch (error) {
    console.error("Error al buscar pedidos:", error); // <-- Chismoso agregado
    res.status(500).json({ error: 'Fallo al cargar pedidos' });
  }
});

// 4. Cargar el catálogo para el Punto de Venta Local
app.get('/api/negocios/:id/productos', async (req, res) => {
  try {
    // <-- SE QUITÓ EL "activo: true" PARA QUE NO TRUENE PRISMA
    const productos = await prisma.producto.findMany({
      where: { negocioId: req.params.id }
    });
    res.json(productos);
  } catch (error) {
    console.error("Error al buscar productos:", error); // <-- Chismoso agregado
    res.status(500).json({ error: 'Fallo al cargar el catálogo' });
  }
});

// Convertimos explícitamente el puerto a número para evitar el choque con TypeScript
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API jalando al 100 en el puerto ${PORT} y abierta a toda la red local`);
});