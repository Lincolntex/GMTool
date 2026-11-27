import 'dotenv/config';
import crypto from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  checkPassphrase,
  clearGmCookie,
  isDefaultPassphrase,
  isGmRequest,
  issueGmCookie,
  requireGm,
} from './auth';
import {
  addParticipant,
  changeRoomScene,
  createRoom,
  endRoom,
  getActiveRoom,
  publicRoom,
  publicTokens,
  setRoomScene,
} from './rooms';
import {
  copyCampaign,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
} from './campaigns';
import { registerSocketHandlers } from './socket';

const PORT = Number(process.env.PORT || 3001);
const uploadDir = path.resolve('uploads');
mkdirSync(uploadDir, { recursive: true });

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => {
      const extension = MIME_EXTENSIONS[file.mimetype] || '';
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!MIME_EXTENSIONS[file.mimetype]) {
      callback(new Error('Background must be a PNG, JPEG, or WebP image.'));
      return;
    }
    callback(null, true);
  },
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});
registerSocketHandlers(io);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/gm/login', (req, res) => {
  const passphrase = typeof req.body?.passphrase === 'string' ? req.body.passphrase : '';
  if (!checkPassphrase(passphrase)) {
    res.status(401).json({ error: 'Incorrect GM passphrase.' });
    return;
  }
  issueGmCookie(res);
  res.json({ ok: true });
});

app.get('/api/gm/session', (req, res) => {
  res.json({
    authenticated: isGmRequest(req),
    defaultPassphrase: isDefaultPassphrase(),
  });
});

app.post('/api/gm/logout', (_req, res) => {
  clearGmCookie(res);
  res.json({ ok: true });
});

app.get('/api/rooms/active', requireGm, (_req, res) => {
  const room = getActiveRoom();
  if (!room) {
    res.json({ room: null });
    return;
  }
  res.json({ room: publicRoom(room), pin: room.pin });
});

app.post('/api/rooms/:id/scene', requireGm, (req, res) => {
  const room = getActiveRoom();
  if (!room || room.id !== req.params.id || room.ended) {
    res.status(404).json({ error: 'Session not found or already ended.' });
    return;
  }

  if (req.body?.index !== undefined) {
    try {
      setRoomScene(room, Number(req.body.index));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid scene.' });
      return;
    }
  } else {
    const direction = String(req.body?.direction || '');
    if (direction !== 'next' && direction !== 'prev') {
      res.status(400).json({ error: 'Scene direction must be "next" or "prev".' });
      return;
    }
    changeRoomScene(room, direction);
  }

  room.pointers.clear();
  io.to(room.id).emit('scene:changed', publicRoom(room));
  res.json({ room: publicRoom(room) });
});

app.post('/api/uploads', requireGm, (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'An image is required.' });
      return;
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

app.get('/api/campaigns', requireGm, (_req, res) => {
  res.json({ campaigns: listCampaigns() });
});

app.get('/api/campaigns/:id', requireGm, (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  res.json({ campaign });
});

app.post('/api/campaigns', requireGm, (req, res) => {
  try {
    const campaign = createCampaign(req.body);
    res.status(201).json({ campaign });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not create campaign.' });
  }
});

app.put('/api/campaigns/:id', requireGm, (req, res) => {
  try {
    const campaign = updateCampaign(req.params.id, req.body);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    res.json({ campaign });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not update campaign.' });
  }
});

app.delete('/api/campaigns/:id', requireGm, (req, res) => {
  if (!deleteCampaign(req.params.id)) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/campaigns/:id/copy', requireGm, (req, res) => {
  const campaign = copyCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  res.status(201).json({ campaign });
});

app.post('/api/campaigns/:id/launch', requireGm, (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  const firstScene = campaign.scenes[0];
  if (!firstScene) {
    res.status(400).json({ error: 'This campaign has no scenes to launch.' });
    return;
  }

  const previous = getActiveRoom();
  const room = createRoom({
    title: campaign.name,
    scenes: campaign.scenes.map((scene) => ({
      title: scene.title,
      background: scene.background,
      grid: scene.grid,
      tokens: scene.tokens,
    })),
  });

  if (previous) {
    previous.ended = true;
    io.to(previous.id).emit('session:ended');
    io.socketsLeave(previous.id);
  }

  res.status(201).json({ room: publicRoom(room), pin: room.pin });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = getActiveRoom();
  if (!room || room.id !== req.params.id || room.ended) {
    res.status(404).json({ error: 'Session not found or already ended.' });
    return;
  }
  res.json({ room: publicRoom(room) });
});

app.post('/api/rooms/:id/join', (req, res) => {
  const room = getActiveRoom();
  if (!room || room.id !== req.params.id || room.ended) {
    res.status(404).json({ error: 'Session not found or already ended.' });
    return;
  }

  const pin = String(req.body?.pin || '').trim();
  if (pin !== room.pin) {
    res.status(401).json({ error: 'Incorrect PIN.' });
    return;
  }

  try {
    const name = String(req.body?.name || '');
    const color = String(req.body?.color || '');
    const shape = req.body?.shape;
    const { token } = addParticipant(room, name, color, shape);
    io.to(room.id).emit('tokens:changed', publicTokens(room));
    res.json({ participantToken: token, room: publicRoom(room) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not join.' });
  }
});

app.post('/api/rooms/:id/end', requireGm, (req, res) => {
  const room = endRoom(req.params.id);
  if (!room) {
    res.status(404).json({ error: 'Session not found or already ended.' });
    return;
  }
  io.to(room.id).emit('session:ended');
  io.socketsLeave(room.id);
  res.json({ ok: true });
});

app.use(
  '/uploads',
  express.static(uploadDir, {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    },
  }),
);

const clientDist = path.resolve('dist/client');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/socket.io')
    ) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: 'Unexpected server error.' });
});

httpServer.listen(PORT, () => {
  console.log(`GMTool alpha server listening on http://localhost:${PORT}`);
  if (isDefaultPassphrase()) {
    console.warn('Using the default GM passphrase "gm-alpha". Set GM_PASSPHRASE in .env.');
  }
});
