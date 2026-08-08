const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

describe('Production-Grade Test Suite: Dedicated WebSocket & Real-Time Streaming Engine', () => {

  let ioServer, httpServer, serverPort;
  const connectedClients = [];

  // Setup dedicated ephemeral Socket.io test server
  beforeAll((done) => {
    httpServer = createServer();
    ioServer = new Server(httpServer, {
      cors: { origin: '*' }
    });

    ioServer.on('connection', (socket) => {
      socket.on('join-build', (buildId) => {
        if (buildId) {
          socket.join(`build-${buildId}`);
        }
      });

      socket.on('leave-build', (buildId) => {
        if (buildId) {
          socket.leave(`build-${buildId}`);
        }
      });
    });

    httpServer.listen(() => {
      serverPort = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    // Disconnect any remaining open clients
    connectedClients.forEach(c => c.disconnect());
    ioServer.close(done);
  });

  const createTestClient = () => {
    const client = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket', 'polling'],
      forceNew: true
    });
    connectedClients.push(client);
    return client;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Connection & Handshake Lifecycle
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. WebSocket Connection Handshake & Lifecycle', () => {

    test('client should successfully connect to WebSocket gateway and receive valid socket.id', (done) => {
      const client = createTestClient();

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        expect(client.id).toBeDefined();
        done();
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Room Isolation & Multiplexing
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Room Isolation & Multiplexing (join-build / leave-build)', () => {

    test('room isolation must prevent cross-room message leakage', (done) => {
      const clientA = createTestClient();
      const clientB = createTestClient();

      let clientAReceived = false;
      let clientBReceived = false;

      clientA.on('connect', () => {
        clientA.emit('join-build', 101);

        clientB.on('connect', () => {
          clientB.emit('join-build', 102);

          // Listeners for log chunks
          clientA.on('build-log', (data) => {
            if (data.buildId === 101) clientAReceived = true;
          });

          clientB.on('build-log', (data) => {
            if (data.buildId === 101) clientBReceived = true; // Should NOT receive
          });

          // Wait a tick for subscriptions to register, then emit to room 101 only
          setTimeout(() => {
            ioServer.to('build-101').emit('build-log', {
              buildId: 101,
              chunk: '[SETUP] Initializing stage 101...\n'
            });

            setTimeout(() => {
              expect(clientAReceived).toBe(true);
              expect(clientBReceived).toBe(false); // Client B in room 102 was shielded
              done();
            }, 50);
          }, 30);
        });
      });
    });

    test('client should stop receiving room events after emitting leave-build', (done) => {
      const client = createTestClient();
      let messagesAfterLeave = 0;

      client.on('connect', () => {
        client.emit('join-build', 202);

        client.on('build-log', () => {
          messagesAfterLeave++;
        });

        setTimeout(() => {
          // Leave the room
          client.emit('leave-build', 202);

          setTimeout(() => {
            // Broadcast after client left
            ioServer.to('build-202').emit('build-log', {
              buildId: 202,
              chunk: '[TEST] Post-leave message\n'
            });

            setTimeout(() => {
              expect(messagesAfterLeave).toBe(0);
              done();
            }, 50);
          }, 30);
        }, 30);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. High-Frequency Real-Time Streaming & Message Ordering
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. High-Frequency Stream Delivery & Ordering Guarantees', () => {

    test('should stream 50 rapid log chunks in strict sequential order without packet loss', (done) => {
      const client = createTestClient();
      const receivedChunks = [];
      const TOTAL_CHUNKS = 50;

      client.on('connect', () => {
        client.emit('join-build', 303);

        client.on('build-log', (data) => {
          receivedChunks.push(data.chunk);

          if (receivedChunks.length === TOTAL_CHUNKS) {
            // Assert all 50 chunks arrived in exact sequential order
            for (let i = 0; i < TOTAL_CHUNKS; i++) {
              expect(receivedChunks[i]).toBe(`[STAGE] Executing step #${i}\n`);
            }
            done();
          }
        });

        setTimeout(() => {
          // Burst 50 consecutive chunks
          for (let i = 0; i < TOTAL_CHUNKS; i++) {
            ioServer.to('build-303').emit('build-log', {
              buildId: 303,
              chunk: `[STAGE] Executing step #${i}\n`
            });
          }
        }, 30);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Multi-Client Broadcast Fanout (1-to-N Live Viewers)
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Multi-Client Fanout to Concurrent Live Viewers', () => {

    test('should broadcast build-status transition to 5 concurrent live viewers simultaneously', (done) => {
      const CLIENT_COUNT = 5;
      const clients = [];
      let receipts = 0;

      for (let i = 0; i < CLIENT_COUNT; i++) {
        const client = createTestClient();
        clients.push(client);

        client.on('connect', () => {
          client.emit('join-build', 404);

          client.on('build-status', (data) => {
            expect(data.buildId).toBe(404);
            expect(data.status).toBe('SUCCESS');
            receipts++;

            if (receipts === CLIENT_COUNT) {
              done();
            }
          });
        });
      }

      // Wait for all 5 clients to connect and join room
      setTimeout(() => {
        ioServer.to('build-404').emit('build-status', {
          buildId: 404,
          status: 'SUCCESS'
        });
      }, 100);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Clean Client Teardown & Disconnect Handling
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Client Disconnect & Socket Cleanup', () => {

    test('server handles client disconnection cleanly without unhandled errors', (done) => {
      const client = createTestClient();

      client.on('connect', () => {
        expect(client.connected).toBe(true);

        client.disconnect();

        setTimeout(() => {
          expect(client.connected).toBe(false);
          done();
        }, 30);
      });
    });
  });

});
