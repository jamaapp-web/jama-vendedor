import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// 1. NUEVAS RUTAS MULTI-NEGOCIO Y LOGIN
// ==========================================

// Login para la app Android del Vendedor
app.post('/api/login/negocio', async (req, res) => {
  const { correo, password } = req.body;
  try {
    const negocio = await prisma.negocio.findUnique({ where: { correo } });
    if (negocio && negocio.password === password) {
      res.json({ id: negocio.id, nombre: negocio.nombre });
    } else {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Lista pública de Negocios para la Web (Pantalla Principal)
app.get('/api/negocios', async (req, res) => {
  try {
    const negocios = await prisma.negocio.findMany({
      where: { estaActivo: true },
      select: { id: true, nombre: true, categoria: true, fotoUrl: true, horaApertura: true, horaCierre: true }
    });
    res.json(negocios);
  } catch (error) {
    res.status(500).json({ error: 'Fallo al cargar negocios' });
  }
});

// Registrar un cliente nuevo (Google/Apple Login)
app.post('/api/clientes', async (req, res) => {
  const { id, nombre, correo, fotoUrl } = req.body;
  try {
    const cliente = await prisma.cliente.upsert({
      where: { id },
      update: { nombre, fotoUrl },
      create: { id, nombre, correo, fotoUrl }
    });
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ error: 'Fallo al registrar cliente' });
  }
});

// ==========================================
// 2. RUTAS EXISTENTES ACTUALIZADAS
// ==========================================

app.post('/api/productos', async (req, res) => {
  const { negocioId, nombre, precio, opciones } = req.body;
  try {
    const producto = await prisma.producto.create({
      data: { negocioId, nombre, precio, opciones: { create: opciones } },
      include: { opciones: true }
    });
    res.json(producto);
  } catch (error) { res.status(500).json({ error: 'Fallo al crear' }); }
});

app.put('/api/productos/:id/disponibilidad', async (req, res) => {
  try {
    const producto = await prisma.producto.update({
      where: { id: req.params.id },
      data: { disponible: req.body.disponible }
    });
    res.json(producto);
  } catch (error) { res.status(500).json({ error: 'Fallo al actualizar' }); }
});

// Pedido actualizado para recibir el metodoPago
app.post('/api/pedidos', async (req, res) => {
  const { negocioId, clienteId, tipoVenta, metodoPago, detalles } = req.body;
  try {
    const total = detalles.reduce((acc: number, item: any) => acc + item.subtotal, 0);
    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId } });
    const comision = (tipoVenta === 'LOCAL') ? 0 : (total * 0.08);

    const pedido = await prisma.pedido.create({
      data: {
        negocioId,
        clienteId,
        tipoVenta,
        metodoPago: metodoPago || "EFECTIVO", // Se guarda el método de pago
        total,
        comision,
        estatus: tipoVenta === 'LOCAL' ? 'COMPLETADO_LOCAL' : 'BUSCANDO_REPARTIDOR',
        nipEntrega: tipoVenta === 'LOCAL' ? null : Math.floor(1000 + Math.random() * 9000).toString(),
        detalles: { create: detalles }
      },
      include: { detalles: { include: { producto: true } } }
    });
    
    if (comision > 0 && negocio) {
      await prisma.negocio.update({
        where: { id: negocioId },
        data: { saldo: negocio.saldo - comision, estaActivo: (negocio.saldo - comision) >= 10 }
      });
    }
    res.json(pedido);
  } catch (error) { res.status(500).json({ error: 'Fallo al crear el pedido' }); }
});

app.get('/api/negocios/:id/pedidos', async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: { negocioId: req.params.id, estatus: { notIn: ['CANCELADO', 'COMPLETADO_LOCAL', 'ENTREGADO'] } },
      include: { detalles: { include: { producto: true } } }
    });
    res.json(pedidos);
  } catch (error) { res.status(500).json({ error: 'Fallo' }); }
});

app.get('/api/negocios/:id/productos', async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({ where: { negocioId: req.params.id } });
    res.json(productos);
  } catch (error) { res.status(500).json({ error: 'Fallo' }); }
});

app.put('/api/pedidos/:id/estatus', async (req, res) => {
  try {
    const pedido = await prisma.pedido.update({
      where: { id: req.params.id },
      data: { estatus: req.body.estatus }
    });
    res.json(pedido);
  } catch (error) { res.status(500).json({ error: 'Fallo' }); }
});

app.get('/api/negocios/:id', async (req, res) => {
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: req.params.id } });
    res.json(negocio);
  } catch (error) { res.status(500).json({ error: 'Fallo' }); }
});

app.put('/api/negocios/:id/horario', async (req, res) => {
  try {
    const negocio = await prisma.negocio.update({
      where: { id: req.params.id },
      data: { horaApertura: req.body.horaApertura, horaCierre: req.body.horaCierre }
    });
    res.json(negocio);
  } catch (error) { res.status(500).json({ error: 'Fallo' }); }
});

app.get('/api/negocios/:id/corte', async (req, res) => {
  try {
    const hace24Horas = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pedidos = await prisma.pedido.findMany({
      where: { negocioId: req.params.id, fecha: { gte: hace24Horas }, estatus: 'COMPLETADO_LOCAL' },
      include: { detalles: { include: { producto: true } } }
    });
    let totalVendido = 0;
    const items: Record<string, { nombre: string, cantidad: number, subtotal: number }> = {};
    pedidos.forEach(p => {
      totalVendido += p.total;
      p.detalles.forEach(d => {
        if (!items[d.productoId]) items[d.productoId] = { nombre: d.producto.nombre, cantidad: 0, subtotal: 0 };
        items[d.productoId].cantidad += d.cantidad;
        items[d.productoId].subtotal += d.subtotal;
      });
    });
    res.json({ total: totalVendido, resumen: Object.values(items) });
  } catch (error) { res.status(500).json({ error: 'Fallo' }); }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`API Multi-Tenant lista en puerto ${PORT}`); });