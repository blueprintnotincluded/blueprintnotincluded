import { expect } from 'chai';
import * as net from 'net';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

function occupyPort(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const blocker = net.createServer();
    blocker.listen(port, () => resolve(blocker));
    blocker.on('error', reject);
  });
}

/** Simulates the error-handler logic from app/server.ts */
function startServer(port: number): Promise<{ server: net.Server; errorMessage: string | null }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        const errorMessage = `Error: port ${port} is already in use. Is another server or Docker container running?`;
        resolve({ server, errorMessage });
      } else {
        reject(err);
      }
    });
    server.listen(port, () => resolve({ server, errorMessage: null }));
  });
}

describe('Server startup', function () {
  describe('when port is free', function () {
    it('listens successfully without error', async function () {
      const port = await getFreePort();
      const { server, errorMessage } = await startServer(port);
      expect(errorMessage).to.be.null;
      expect(server.listening).to.be.true;
      await new Promise<void>(resolve => server.close(() => resolve()));
    });
  });

  describe('when port is already in use', function () {
    let blocker: net.Server;
    let port: number;

    before(async function () {
      port = await getFreePort();
      blocker = await occupyPort(port);
    });

    after(async function () {
      await new Promise<void>(resolve => blocker.close(() => resolve()));
    });

    it('reports EADDRINUSE with a clear message including the port number', async function () {
      const { errorMessage } = await startServer(port);
      expect(errorMessage).to.not.be.null;
      expect(errorMessage!).to.include('already in use');
      expect(errorMessage!).to.include(String(port));
    });
  });
});
