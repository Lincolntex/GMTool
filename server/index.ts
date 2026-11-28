import 'dotenv/config';
import crypto from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
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
  hydrateActiveRoom,
  publicParticipants,
  publicRoom,
  publicTokens,
  removeParticipant,
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
import { pool } from './db/client';
import { runMigrations } from './db/migrate';

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

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  }),
);

app.post('/api/gm/login', (req, res) => {
  const passphrase =
    typeof req.body?.passphrase === 'string' ? req.body.passphrase : '';
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

app.post(
  '/api/rooms/:id/scene',
  requireGm,
  asyncHandler(async (req, res) => {
    const room = getActiveRoom();
    if (!room || room.id !== req.params.id || room.ended) {
      res.status(404).json({ error: 'Session not found or already ended.' });
      return;
    }

    if (req.body?.index !== undefined) {
      try {
        await setRoomScene(room, Number(req.body.index));
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Invalid scene.',
        });
        return;
      }
    } else {
      const direction = String(req.body?.direction || '');
      if (direction !== 'next' && direction !== 'prev') {
        res.status(400).json({
          error: 'Scene direction must be "next" or "prev".',
        });
        return;
      }
      await changeRoomScene(room, direction);
    }

    room.pointers.clear();
    io.to(room.id).emit('scene:changed', publicRoom(room));
    res.json({ room: publicRoom(room) });
  }),
);

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

app.get(
  '/api/campaigns',
  requireGm,
  asyncHandler(async (_req, res) => {
    res.json({ campaigns: await listCampaigns() });
  }),
);

app.get(
  '/api/campaigns/:id',
  requireGm,
  asyncHandler(async (req, res) => {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    res.json({ campaign });
  }),
);

app.post(
  '/api/campaigns',
  requireGm,
  asyncHandler(async (req, res) => {
    try {
      const campaign = await createCampaign(req.body);
      res.status(201).json({ campaign });
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Could not create campaign.',
      });
    }
  }),
);

app.put(
  '/api/campaigns/:id',
  requireGm,
  asyncHandler(async (req, res) => {
    try {
      const campaign = await updateCampaign(req.params.id, req.body);
      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found.' });
        return;
      }
      res.json({ campaign });
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Could not update campaign.',
      });
    }
  }),
);

app.delete(
  '/api/campaigns/:id',
  requireGm,
  asyncHandler(async (req, res) => {
    if (!(await deleteCampaign(req.params.id))) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    res.json({ ok: true });
  }),
);

app.post(
  '/api/campaigns/:id/copy',
  requireGm,
  asyncHandler(async (req, res) => {
    const campaign = await copyCampaign(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    res.status(201).json({ campaign });
  }),
);

app.post(
  '/api/campaigns/:id/launch',
  requireGm,
  asyncHandler(async (req, res) => {
    const campaign = await getCampaign(req.params.id);
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
    const room = await createRoom({
      title: campaign.name,
      campaignId: campaign.id,
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
  }),
);

app.get('/api/rooms/:id', (req, res) => {
  const room = getActiveRoom();
  if (!room || room.id !== req.params.id || room.ended) {
    res.status(404).json({ error: 'Session not found or already ended.' });
    return;
  }
  res.json({ room: publicRoom(room) });
});

app.post(
  '/api/rooms/:id/join',
  asyncHandler(async (req, res) => {
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
      const { token } = await addParticipant(room, name, color, shape);
      io.to(room.id).emit('tokens:changed', publicTokens(room));
      res.json({ participantToken: token, room: publicRoom(room) });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Could not join.',
      });
    }
  }),
);

app.delete(
  '/api/rooms/:id/participants/:participantId',
  requireGm,
  asyncHandler(async (req, res) => {
    const room = getActiveRoom();
    if (!room || room.id !== req.params.id || room.ended) {
      res.status(404).json({ error: 'Session not found or already ended.' });
      return;
    }

    try {
      const participant = await removeParticipant(
        room,
        req.params.participantId,
      );
      const target = participant.socketId
        ? io.sockets.sockets.get(participant.socketId)
        : undefined;

      if (target) {
        target.leave(room.id);
        target.emit('participant:kicked', {
          participantId: participant.id,
          name: participant.name,
        });
        setTimeout(() => target.disconnect(true), 200);
      }

      io.to(room.id).emit('participants:update', {
        participants: publicParticipants(room),
        gmConnected: Boolean(room.gmSocketId),
      });
      io.to(room.id).emit('tokens:changed', publicTokens(room));
      io.to(room.id).emit('pointer:end', { participantId: participant.id });

      res.json({ ok: true, room: publicRoom(room) });
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Could not remove that player.',
      });
    }
  }),
);

app.post(
  '/api/rooms/:id/end',
  requireGm,
  asyncHandler(async (req, res) => {
    const room = await endRoom(req.params.id);
    if (!room) {
      res.status(404).json({ error: 'Session not found or already ended.' });
      return;
    }
    io.to(room.id).emit('session:ended');
    io.socketsLeave(room.id);
    res.json({ ok: true });
  }),
);

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

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Unexpected server error.' });
  },
);

async function start(): Promise<void> {
  await runMigrations();
  await hydrateActiveRoom();

  httpServer.listen(PORT, () => {
    console.log(`GMTool alpha server listening on http://localhost:${PORT}`);
    if (isDefaultPassphrase()) {
      console.warn(
        'Using the default GM passphrase "gm-alpha". Set GM_PASSPHRASE in .env.',
      );
    }
  });
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down.`);

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out.');
    process.exit(1);
  }, 5000);
  forceExit.unref();

  io.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void start().catch(async (error: unknown) => {
  console.error('GMTool alpha failed to start.', error);
  await pool.end();
  process.exitCode = 1;
});
