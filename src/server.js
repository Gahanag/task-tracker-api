'use strict';

require('dotenv').config();
const { execSync } = require('child_process');
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
} catch(e) { console.error('Migration failed:', e.message); }
const app = require('./app');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./config/logger');

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    await connectDB();
    await connectRedis();

    const server = app.listen(PORT, () => {
      logger.info(`🚀 Task Tracker API running on port ${PORT}`);
      logger.info(`📖 Swagger docs: http://localhost:${PORT}/api-docs`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        const { prisma } = require('./config/database');
        const { redis } = require('./config/redis');
        await prisma.$disconnect();
        redis.disconnect();
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
