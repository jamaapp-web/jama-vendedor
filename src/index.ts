import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'http';
import { Server } from 'socket.io';

const prisma = new PrismaClient();
const app = express();

// NUEVO: Envolvemos Express para soportar WebSockets
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

app.use(cors());
// Aumentamos el límite a 10MB porque las imágenes en Base64 son pesadas
app.use(express.json({ limit: '10mb' })); 

// Inicializar el cliente de Supabase Storage
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

// ==========================================
// NUEVO: MOTOR DE TIEMPO REAL (WEBSOCKETS)
// ==========================================
io.on('connection', (socket) => {
  console.log('📱 Cliente conectado al WebSocket:', socket.id);
  
  // El KDS de Android se unirá a un "cuarto" con el ID de su negocio
  socket.on('unirse_cocina', (negocioId) => {
    socket.join(negocioId);
    console.log(`Cocinero unido al canal del negocio: ${negocioId}`);
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// ==========================================
// RUTA PARA SUBIR FOTOS (STORAGE)
// ==========================================
app.post('/api/upload', async (req, res) => {
  try {
    const { imagenBase64, nombreArchivo } = req.body;
    if (!imagenBase64 || !nombreArchivo) {
      return res.status(400).json({ error: 'Faltan datos de la imagen' });
    }

    // Convertimos el texto Base64 de vuelta a un archivo binario
    const buffer = Buffer.from(imagenBase64, 'base64');

    // Subimos el archivo al bucket "jama-imagenes"
    const { data, error } = await supabase.storage
      .from('jama-imagenes')
      .upload(nombreArchivo, buffer, {
        contentType: 'image/jpeg',
        upsert: true // Si ya existe una foto con ese nombre, la reemplaza
      });

    if (error) throw error;

    // Obtenemos la URL pública para guardarla en la base de datos
    const { data: urlData } = supabase.storage
      .from('jama-imagenes')
      .getPublicUrl(nombreArchivo);

    res.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error("Error al subir imagen:", error);
    res.status(500).json({ error: 'Fallo al subir imagen a Supabase' });
  }
});

// ==========================================
// 1. LOGIN Y NEGOCIOS
// ==========================================
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
    console.error("Error en login:", error);
    res.status(500).json({ error: 'Error en el servidor' }); 
  }
});

app.get('/api/negocios', async (req, res) => {
  try {
    const negocios = await prisma.negocio.findMany({
      where: { estaActivo: true },
      select: { id: true, nombre: true, categoria: true, fotoUrl: true, horaApertura: true, horaCierre: true }
    });
    res.json(negocios);
  } catch (error) { 
    console.error("Error al cargar negocios:", error);
    res.status(500).json({ error: 'Fallo al cargar negocios' }); 
  }
});

app.get('/api/negocios/:id', async (req, res) => {
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: req.params.id } });
    res.json(negocio);
  } catch (error) { 
    console.error("Error al obtener negocio:", error);
    res.status(500).json({ error: 'Fallo' }); 
  }
});

app.put('/api/negocios/:id/horario', async (req, res) => {
  try {
    const negocio = await prisma.negocio.update({
      where: { id: req.params.id },
      data: { horaApertura: req.body.horaApertura, horaCierre: req.body.horaCierre }
    });
    res.json(negocio);
  } catch (error) { 
    console.error("Error al actualizar horario:", error);
    res.status(500).json({ error: 'Fallo' }); 
  }
});

app.put('/api/negocios/:id/configuracion', async (req, res) => {
  try {
    const { latitud, longitud, aceptaEfectivo, aceptaTransferencia, fotoUrl } = req.body;
    const negocio = await prisma.negocio.update({
      where: { id: req.params.id },
      data: { latitud, longitud, aceptaEfectivo, aceptaTransferencia, fotoUrl }
    });
    res.json(negocio);
  } catch (error) { 
    console.error("Error al actualizar configuracion:", error);
    res.status(500).json({ error: 'Fallo al actualizar configuracion' }); 
  }
});

// ==========================================
// 2. CLIENTES
// ==========================================
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
    console.error("Error al registrar cliente:", error);
    res.status(500).json({ error: 'Fallo al registrar cliente' }); 
  }
});

// ==========================================
// 3. PRODUCTOS Y CATÁLOGO
// ==========================================
app.get('/api/negocios/:id/productos', async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({ 
      where: { negocioId: req.params.id },
      include: { opciones: true }
    });
    res.json(productos);
  } catch (error) { 
    console.error("Error al cargar productos:", error);
    res.status(500).json({ error: 'Fallo al cargar catálogo' }); 
  }
});

app.post('/api/negocios/:id/productos', async (req, res) => {
  try {
    const { nombre, precio, fotoUrl } = req.body;
    const nuevoProducto = await prisma.producto.create({
      data: { nombre, precio, fotoUrl, disponible: true, negocioId: req.params.id },
      include: { opciones: true }
    });
    res.json(nuevoProducto);
  } catch (error) { 
    console.error("Error al crear producto:", error);
    res.status(500).json({ error: 'Error al crear el producto' }); 
  }
});

app.post('/api/productos/:id/opciones', async (req, res) => {
  try {
    const { nombre, precioExtra } = req.body;
    const nuevaOpcion = await prisma.opcionProducto.create({
      data: {
        nombre,
        precioExtra,
        productoId: req.params.id
      }
    });
    res.json(nuevaOpcion);
  } catch (error) { 
    console.error("Error al agregar modificador:", error);
    res.status(500).json({ error: 'Fallo al agregar modificador' }); 
  }
});

app.put('/api/productos/:id/disponibilidad', async (req, res) => {
  try {
    const producto = await prisma.producto.update({
      where: { id: req.params.id },
      data: { disponible: req.body.disponible }
    });
    res.json(producto);
  } catch (error) { 
    console.error("Error al actualizar disponibilidad:", error);
    res.status(500).json({ error: 'Fallo al actualizar' }); 
  }
});

// ==========================================
// 4. PEDIDOS, KDS Y CAJA
// ==========================================
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
        metodoPago: metodoPago || "EFECTIVO",
        total,
        comision,
        estatus: tipoVenta === 'LOCAL' ? 'PENDIENTE_LOCAL' : 'BUSCANDO_REPARTIDOR',
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

    // 🔥 MAGIA: Le avisamos a la cocina de este negocio que recargue su pantalla
    io.to(negocioId).emit('recargar_kds');

    res.json(pedido);
  } catch (error) { 
    console.error("Error al crear pedido:", error);
    res.status(500).json({ error: 'Fallo al crear el pedido' }); 
  }
});

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
    console.error("Error al cargar pedidos del KDS:", error);
    res.status(500).json({ error: 'Fallo' }); 
  }
});

app.put('/api/pedidos/:id/estatus', async (req, res) => {
  try {
    const pedidoOriginal = await prisma.pedido.findUnique({ where: { id: req.params.id } });
    
    const pedido = await prisma.pedido.update({
      where: { id: req.params.id },
      data: { estatus: req.body.estatus }
    });
    
    // 🔥 MAGIA: Avisamos a los celulares que el estatus cambió (para que se borre de la pantalla)
    if (pedidoOriginal) {
      io.to(pedidoOriginal.negocioId).emit('recargar_kds');
    }

    res.json(pedido);
  } catch (error) { 
    console.error("Error al actualizar estatus de pedido:", error);
    res.status(500).json({ error: 'Fallo' }); 
  }
});

app.get('/api/negocios/:id/corte', async (req, res) => {
  try {
    const hace24Horas = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pedidos = await prisma.pedido.findMany({
      where: { 
        negocioId: req.params.id, 
        fecha: { gte: hace24Horas }, 
        estatus: { in: ['COMPLETADO_LOCAL', 'ENTREGADO'] } 
      },
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
  } catch (error) { 
    console.error("Error al cargar corte de caja:", error);
    res.status(500).json({ error: 'Fallo' }); 
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
// MUY IMPORTANTE: Usamos httpServer en lugar de app
httpServer.listen(PORT, '0.0.0.0', () => { console.log(`API y WebSockets listos en puerto ${PORT}`); });