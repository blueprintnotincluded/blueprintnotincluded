import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import sinon from 'sinon';
import { before, after } from 'mocha';

// Load test environment variables before any tests run
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Set test flag to suppress initialization logs
process.env.NODE_ENV = 'test';

// Mock nodemailer to prevent SMTP connection errors in tests
const nodemailerMock = {
  createTransport: sinon.stub().returns({
    verify: sinon.stub().callsArgWith(0, null, true),
    sendMail: sinon.stub().resolves({ messageId: 'test-message-id' }),
  }),
};

// Mock Mailjet to prevent external API calls in tests
const mailjetMock = sinon.stub().returns({
  post: sinon.stub().returns({
    request: sinon.stub().resolves({ body: { Messages: [{ Status: 'success' }] } }),
  }),
});

// Apply mocks before any imports
require.cache[require.resolve('nodemailer')] = {
  id: 'nodemailer',
  filename: 'nodemailer',
  loaded: true,
  children: [],
  parent: null,
  paths: [],
  exports: nodemailerMock,
  isPreloading: false,
  path: 'nodemailer',
  require: require,
} as NodeModule;

require.cache[require.resolve('node-mailjet')] = {
  id: 'node-mailjet',
  filename: 'node-mailjet',
  loaded: true,
  children: [],
  parent: null,
  paths: [],
  exports: mailjetMock,
  isPreloading: false,
  path: 'node-mailjet',
  require: require,
} as NodeModule;

// Suppress console output during tests to reduce noise
const originalConsole = { ...console };
before(function () {
  console.log = sinon.stub();
  console.error = sinon.stub();
  console.warn = sinon.stub();
});

// Database setup and teardown for tests
before(async function () {
  this.timeout(10000);
  // Give the app time to initialize and connect to database
  await new Promise(resolve => setTimeout(resolve, 2000));
});

// Global cleanup after ALL tests complete
after(async function () {
  // Restore console
  Object.assign(console, originalConsole);
  sinon.restore();

  // Clean up database connections
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
});
