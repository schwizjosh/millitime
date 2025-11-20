import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export async function mlRoutes(fastify: FastifyInstance) {
  // Trigger ML model training
  fastify.post<{ Body: { days?: number } }>(
    '/api/ml/train',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { days = 30 } = request.body;

      // Validate days parameter
      if (days < 7 || days > 365) {
        return reply.code(400).send({ error: 'Days must be between 7 and 365' });
      }

      try {
        fastify.log.info({ days }, 'Starting ML model training');

        // Execute Python training script
        const scriptPath = path.join(__dirname, '../../..', 'ml-service', 'train_model.py');
        const venvPython = path.join(__dirname, '../../..', 'ml-service', 'venv', 'bin', 'python3');

        // Check if venv exists, otherwise use system python
        const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

        // Run training in background
        const command = `cd ${path.dirname(scriptPath)} && ${pythonCmd} ${scriptPath} ${days} >> logs/training.log 2>&1 &`;

        exec(command, (error) => {
          if (error) {
            fastify.log.error({ error }, 'Failed to start training');
          } else {
            fastify.log.info('Training started in background');
          }
        });

        return reply.send({
          message: 'Training started in background',
          days,
          status: 'running',
          estimated_time: '1-2 minutes',
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Failed to trigger training');
        return reply.code(500).send({ error: 'Failed to trigger training' });
      }
    }
  );

  // Get training status
  fastify.get('/api/ml/status', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      // Check if model exists
      const modelPath = path.join(__dirname, '../../..', 'ml-service', 'models', 'xgboost_signal_classifier.json');
      const modelExists = fs.existsSync(modelPath);

      if (!modelExists) {
        return reply.send({
          status: 'no_model',
          message: 'No trained model found. Run training first.',
          model_exists: false,
        });
      }

      // Get model file stats
      const stats = fs.statSync(modelPath);
      const lastTrainedAt = stats.mtime;
      const modelSize = (stats.size / (1024 * 1024)).toFixed(2); // MB

      // Try to read model metadata
      let metadata = null;
      const metadataPath = path.join(path.dirname(modelPath), 'model_metadata.json');
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      }

      return reply.send({
        status: 'ready',
        message: 'Model is trained and ready for predictions',
        model_exists: true,
        model_size_mb: modelSize,
        last_trained_at: lastTrainedAt,
        metadata,
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to get training status');
      return reply.code(500).send({ error: 'Failed to get training status' });
    }
  });

  // Get model information
  fastify.get('/api/ml/model-info', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const metadataPath = path.join(__dirname, '../../..', 'ml-service', 'models', 'model_metadata.json');

      if (!fs.existsSync(metadataPath)) {
        return reply.code(404).send({ error: 'Model metadata not found. Train the model first.' });
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      return reply.send({
        model_info: metadata,
        features: {
          total: 42,
          categories: {
            technical_indicators: 20,
            confidence_scores: 4,
            signal_characteristics: 6,
            position_parameters: 1,
            time_features: 6,
            derived_features: 5,
          },
        },
        performance: {
          train_accuracy: metadata.train_accuracy || 'N/A',
          test_accuracy: metadata.test_accuracy || 'N/A',
          auc_roc: metadata.auc_roc || 'N/A',
          training_samples: metadata.training_samples || 'N/A',
          test_samples: metadata.test_samples || 'N/A',
        },
        top_features: metadata.feature_importance?.slice(0, 10) || [],
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to get model info');
      return reply.code(500).send({ error: 'Failed to get model info' });
    }
  });

  // Get training logs (last 100 lines)
  fastify.get('/api/ml/logs', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const logPath = path.join(__dirname, '../../..', 'ml-service', 'logs', 'training.log');

      if (!fs.existsSync(logPath)) {
        return reply.send({ logs: [], message: 'No training logs found' });
      }

      // Get last 100 lines
      const { stdout } = await execAsync(`tail -n 100 ${logPath}`);

      return reply.send({
        logs: stdout.split('\n').filter(line => line.trim()),
        log_file: logPath,
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to get training logs');
      return reply.code(500).send({ error: 'Failed to get training logs' });
    }
  });
}
